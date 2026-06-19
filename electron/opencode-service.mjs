import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createOpencodeClient } from '@opencode-ai/sdk/client';
import { createOpencodeServer } from '@opencode-ai/sdk/server';
import { resolveAppRoot } from './ensure-opencode.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolveAppRoot();

const BUILTIN_PROVIDER_TYPES = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  openrouter: 'openrouter',
};

const PROVIDER_CATEGORY_NAMES = {
  opencode: 'Free',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

function categoryForProvider(provider) {
  if (PROVIDER_CATEGORY_NAMES[provider.id]) return PROVIDER_CATEGORY_NAMES[provider.id];
  if (provider.id.startsWith('custom-')) return provider.name || 'Custom';
  return provider.name || provider.id;
}

const TOOL_NAME_MAP = {
  apply_patch: 'edit',
};

let client = null;
let server = null;
let serverOwned = false;
let eventLoop = null;
let eventLoopDone = null;
let emitEvent = null;

let activeWorkspace = null;

function directoryOptions(workspace) {
  const dir = workspace || activeWorkspace;
  return dir ? { query: { directory: dir } } : {};
}

export function setWorkspace(folderPath) {
  activeWorkspace = folderPath || null;
  return { workspace: activeWorkspace };
}

export function getActiveWorkspace() {
  return activeWorkspace;
}

const chatSessions = new Map();
const sessionChats = new Map();
const chatWorkspaces = new Map();
const activeRuns = new Map();
const activePolls = new Set();
const messageRoles = new Map();
const seenQuestionRequests = new Set();
const seenPermissionRequests = new Set();
/** @type {Map<string, { chatId: string, parentSessionId: string, toolCallId: string, args: object, workspace?: string }>} */
const taskChildSessions = new Map();

const DEFAULT_PERMISSION_CONFIG = {
  read: {
    '*': 'allow',
    '*.env': 'ask',
    '*.env.*': 'ask',
    '*.env.example': 'allow',
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLatestAssistantEntry(messages = []) {
  const assistants = messages.filter((entry) => entry.info?.role === 'assistant');
  return assistants[assistants.length - 1] || null;
}

function truncateActivity(text, max = 72) {
  if (!text) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function fileBasename(pathValue) {
  if (!pathValue) return '';
  return String(pathValue).split(/[/\\]/).pop();
}

function formatToolPartActivity(part) {
  const input = part.state?.input || part.input || {};
  const tool = part.tool;
  const pathValue = input.path || input.file || input.filePath;
  const base = fileBasename(pathValue);

  switch (tool) {
    case 'read':
      return base ? `Reading ${base}…` : 'Reading file…';
    case 'write':
    case 'create':
      return base ? `Writing ${base}…` : 'Writing file…';
    case 'edit':
    case 'apply_patch':
      return base ? `Editing ${base}…` : 'Editing file…';
    case 'bash':
      return input.command
        ? `Running ${truncateActivity(input.command, 48)}…`
        : 'Running command…';
    case 'grep': {
      const pattern = input.pattern ?? input.regex ?? input.grep;
      return pattern
        ? `Searching for "${truncateActivity(pattern, 32)}"…`
        : 'Searching file contents…';
    }
    case 'glob':
    case 'search_files': {
      const pattern = input.glob_pattern ?? input.pattern;
      return pattern
        ? `Finding files matching "${truncateActivity(pattern, 32)}"…`
        : 'Finding files…';
    }
    case 'webfetch':
      return input.url ? `Fetching ${truncateActivity(input.url, 40)}…` : 'Fetching URL…';
    case 'websearch':
      return input.search_term || input.query
        ? `Searching the web for "${truncateActivity(input.search_term || input.query, 32)}"…`
        : 'Searching the web…';
    default:
      return `${String(tool || 'tool').replace(/_/g, ' ')}…`;
  }
}

function formatTextPartActivity(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return truncateActivity(cleaned, 72);
}

/** @type {Map<string, string>} */
const lastTaskActivity = new Map();

function getTaskChildSessionId(meta = {}) {
  return meta.sessionId || meta.sessionID || null;
}

function registerTaskChildSession(childSessionId, info) {
  if (!childSessionId || !info?.toolCallId) return;
  taskChildSessions.set(childSessionId, info);
}

function unregisterTaskChildSession(childSessionId) {
  if (childSessionId) taskChildSessions.delete(childSessionId);
}

function clearTaskChildSessionsForParent(parentSessionId) {
  if (!parentSessionId) return;
  for (const [childId, info] of taskChildSessions.entries()) {
    if (info.parentSessionId === parentSessionId) {
      lastTaskActivity.delete(info.toolCallId);
      taskChildSessions.delete(childId);
    }
  }
}

async function fetchChildSessionActivity(childSessionId, workspace) {
  if (!client || !childSessionId) return null;
  try {
    const result = await client.session.messages({
      path: { id: childSessionId },
      ...directoryOptions(workspace),
    });
    const messages = result.data || [];

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const entry = messages[i];
      if (entry.info?.role !== 'assistant') continue;
      const lastTool = [...(entry.parts || [])].reverse().find((p) => p.type === 'tool');
      if (lastTool) return formatToolPartActivity(lastTool);
    }

    for (const entry of messages) {
      if (entry.info?.role !== 'assistant') continue;
      const textPart = entry.parts?.find((p) => p.type === 'text' && p.text?.trim());
      if (textPart) return formatTextPartActivity(textPart.text);
    }
  } catch {
    /* child session may not exist yet */
  }
  return null;
}

function shouldEmitTaskActivity(toolCallId, activity, running) {
  if (!toolCallId) return true;
  if (!running) {
    lastTaskActivity.delete(toolCallId);
    return true;
  }
  const prev = lastTaskActivity.get(toolCallId);
  if (prev === activity) return false;
  if (activity) lastTaskActivity.set(toolCallId, activity);
  return true;
}

function emitSubAgentActivityFromChildPart(part, delta = null) {
  const link = taskChildSessions.get(part.sessionID);
  if (!link || !emitEvent) return;

  let activity = null;
  if (part.type === 'tool') {
    activity = formatToolPartActivity(part);
  } else if (part.type === 'text') {
    activity = formatTextPartActivity(part.text || delta);
  }
  if (!activity || !shouldEmitTaskActivity(link.toolCallId, activity, true)) return;

  emitEvent({
    type: 'tool-update',
    chatId: link.chatId,
    sessionId: link.parentSessionId,
    toolCall: {
      id: link.toolCallId,
      name: 'task',
      args: link.args,
      status: 'running',
      activity,
    },
  });
}

async function enrichTaskToolCall(part, toolCall, chatId, sessionId, workspace) {
  if (toolCall.name !== 'task') return toolCall;

  const state = part?.state || {};
  const meta = state.metadata || part?.metadata || {};
  const childSessionId = getTaskChildSessionId(meta);
  const description = toolCall.args?.description || '';
  const ws = workspace || chatWorkspaces.get(chatId);

  if (toolCall.status === 'complete') {
    if (childSessionId) unregisterTaskChildSession(childSessionId);
    if (!toolCall.activity || toolCall.activity === description) {
      const activity = childSessionId ? await fetchChildSessionActivity(childSessionId, ws) : null;
      toolCall.activity = activity || 'Completed';
    }
    return toolCall;
  }

  if (childSessionId) {
    registerTaskChildSession(childSessionId, {
      chatId,
      parentSessionId: sessionId,
      toolCallId: toolCall.id,
      args: toolCall.args,
      workspace: ws,
    });
  }

  const activity = childSessionId ? await fetchChildSessionActivity(childSessionId, ws) : null;
  if (activity && activity !== description) {
    toolCall.activity = activity;
  } else {
    toolCall.activity = 'Starting sub-agent…';
  }
  return toolCall;
}

async function emitToolUpdate(chatId, sessionId, messageId, part, toolCall) {
  const ws = chatWorkspaces.get(chatId);
  const enriched = part?.tool === 'task' || toolCall.name === 'task'
    ? await enrichTaskToolCall(part, { ...toolCall }, chatId, sessionId, ws)
    : toolCall;
  if (!emitEvent) return;
  const running = enriched.status === 'pending' || enriched.status === 'running';
  if (
    enriched.name === 'task'
    && !shouldEmitTaskActivity(enriched.id, enriched.activity, running)
  ) {
    return;
  }
  emitEvent({
    type: 'tool-update',
    chatId,
    sessionId,
    messageId,
    toolCall: enriched,
  });
}

async function getAssistantMessageIds(sessionId, workspace) {
  if (!client || !sessionId) return new Set();
  try {
    const result = await client.session.messages({
      path: { id: sessionId },
      ...directoryOptions(workspace),
    });
    return new Set(
      (result.data || [])
        .filter((entry) => entry.info?.role === 'assistant' && entry.info?.id)
        .map((entry) => entry.info.id),
    );
  } catch {
    return new Set();
  }
}

function isKnownAssistantMessage(messageId, knownAssistantIds) {
  return Boolean(messageId && knownAssistantIds?.has(messageId));
}

async function pollSessionResponse(chatId, sessionId, workspace, knownAssistantIds = new Set()) {
  if (activePolls.has(sessionId)) return;
  activePolls.add(sessionId);

  const ws = workspace || chatWorkspaces.get(chatId);
  let lastText = '';
  const seenTools = new Map();

  try {
    let idlePolls = 0;
    let lastActivity = Date.now();
    const IDLE_POLL_LIMIT = 16; // 8s of continuous idle with no response text

    for (let attempt = 0; ; attempt++) {
      if (!client || !chatSessions.has(chatId)) return;

      const [statusRes, msgRes] = await Promise.all([
        client.session.status({ ...directoryOptions(ws) }),
        client.session.messages({
          path: { id: sessionId },
          ...directoryOptions(ws),
        }),
      ]);

      const sessionStatus = statusRes.data?.[sessionId];
      const isBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
      const latest = getLatestAssistantEntry(msgRes.data || []);
      const latestAssistantId = latest?.info?.id || null;
      const isStaleAssistant = isKnownAssistantMessage(latestAssistantId, knownAssistantIds);

      if (latest?.info?.error && !isStaleAssistant && emitEvent) {
        emitEvent({
          type: 'assistant-message',
          chatId,
          sessionId,
          messageId: latest.info.id,
          error: latest.info.error,
          completed: true,
        });
        await emitDone(chatId, sessionId);
        activeRuns.delete(chatId);
        return;
      }

      for (const entry of msgRes.data || []) {
        if (entry.info?.id && entry.info?.role) {
          messageRoles.set(entry.info.id, entry.info.role);
        }
      }

      if (latest?.parts?.length && !isStaleAssistant && emitEvent) {
        for (const part of latest.parts) {
          if (part.type === 'text' && part.text && part.text !== lastText) {
            lastText = part.text;
            lastActivity = Date.now();
            emitEvent({
              type: 'text-full',
              chatId,
              sessionId,
              messageId: part.messageID,
              text: part.text,
            });
          }

          if (part.type === 'tool') {
            const prev = seenTools.get(part.id);
            const mapped = mapToolToFrontend(part);
            const signature = JSON.stringify(mapped);
            if (signature !== prev) {
              seenTools.set(part.id, signature);
              lastActivity = Date.now();
              void emitToolUpdate(chatId, sessionId, part.messageID, part, mapped);
              if (
                part.tool === 'question'
                && (mapped.status === 'pending' || mapped.status === 'running')
              ) {
                const input = part.state?.input || {};
                void syncQuestionRequests(sessionId, {
                  chatId,
                  questions: input.questions || mapped.args?.questions,
                  toolCallId: part.id,
                });
              }
            } else if (part.tool === 'task' && (mapped.status === 'pending' || mapped.status === 'running')) {
              // Re-fetch child session activity even when the task part itself hasn't changed.
              lastActivity = Date.now();
              void emitToolUpdate(chatId, sessionId, part.messageID, part, mapped);
            }
          }
        }
      }

      const completed = Boolean(latest?.info?.time?.completed);
      if (completed && lastText && !isStaleAssistant) {
        await emitDone(chatId, sessionId);
        activeRuns.delete(chatId);
        return;
      }

      // If busy or has activity, reset idle counters and keep polling
      if (isBusy || (Date.now() - lastActivity) < 5000) {
        idlePolls = 0;
        await sleep(500);
        continue;
      }

      // Not busy and no recent activity - check exit conditions
      if (!lastText && attempt >= 8 && !isStaleAssistant) {
        if (emitEvent) {
          emitEvent({
            type: 'error',
            chatId,
            message: 'No response from the model. Pick a free OpenCode model or add an API key in Settings → Providers.',
          });
        }
        activeRuns.delete(chatId);
        return;
      }

      if (isStaleAssistant) {
        idlePolls = 0;
        if (attempt >= 120) {
          if (emitEvent) {
            emitEvent({
              type: 'error',
              chatId,
              message: 'No response from the model. Pick a free OpenCode model or add an API key in Settings → Providers.',
            });
          }
          activeRuns.delete(chatId);
          return;
        }
        await sleep(500);
        continue;
      }

      idlePolls++;
      if (idlePolls >= IDLE_POLL_LIMIT && !isStaleAssistant) {
        if (emitEvent) {
          emitEvent({
            type: 'error',
            chatId,
            message: 'Response timed out. Check your model and provider API key in Settings.',
          });
        }
        activeRuns.delete(chatId);
        return;
      }

      await sleep(500);
    }
  } finally {
    activePolls.delete(sessionId);
  }
}

function ensureOpencodeOnPath() {
  const binDir = path.join(APP_ROOT, 'node_modules', '.bin');
  const opencodeBin = path.join(APP_ROOT, 'node_modules', 'opencode-ai', 'bin');
  const sep = path.delimiter;
  const paths = [binDir, opencodeBin, ...process.env.PATH.split(sep)];
  const unique = [...new Set(paths.filter(Boolean))];
  process.env.PATH = unique.join(sep);
}

function getAvailablePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, host, () => {
      const port = probe.address().port;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
    probe.on('error', reject);
  });
}

async function isOpencodeHealthy(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.healthy === true;
  } catch {
    return false;
  }
}

async function attachToServer(baseUrl) {
  client = createOpencodeClient({ baseUrl });
  server = {
    url: baseUrl,
    close() {},
  };
  serverOwned = false;
  await startEventSubscription();
  return getStatus();
}

async function spawnServer(port, options) {
  const workspace = options.workspace || APP_ROOT;
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true });

  const spawned = await createOpencodeServer({
    hostname: '127.0.0.1',
    port,
    timeout: options.timeout || 30000,
    config: {
      model: options.defaultModel || 'opencode/big-pickle',
      permission: DEFAULT_PERMISSION_CONFIG,
    },
  });

  server = spawned;
  serverOwned = true;
  client = createOpencodeClient({ baseUrl: server.url });
  await startEventSubscription();
  return getStatus();
}

function resolveProviderId(provider) {
  if (provider.type === 'custom') {
    return `custom-${provider.id.replace(/^prov-/, '')}`;
  }
  return BUILTIN_PROVIDER_TYPES[provider.type] || provider.type;
}

function mapToolArgs(toolName, input = {}) {
  const args = { ...input };
  if (args.file && !args.path) args.path = args.file;
  if (args.filePath && !args.path) args.path = args.filePath;
  if (args.command && toolName === 'bash') return { command: args.command };
  if (args.path) return { path: args.path, ...args };
  return args;
}

function mapToolStatus(state = {}) {
  const raw = state.status;
  if (raw === 'completed' || raw === 'complete') return 'complete';
  if (raw === 'error') return 'complete';
  if (raw === 'running') return 'running';
  if (state.output != null && state.time?.end != null) return 'complete';
  return 'pending';
}

async function flushToolStates(chatId, sessionId) {
  if (!client || !emitEvent) return;
  const ws = chatWorkspaces.get(chatId);
  try {
    const msgRes = await client.session.messages({
      path: { id: sessionId },
      ...directoryOptions(ws),
    });
    const latest = getLatestAssistantEntry(msgRes.data || []);
    for (const part of latest?.parts || []) {
      if (part.type !== 'tool') continue;
      const toolCall = mapToolToFrontend(part);
      await emitToolUpdate(chatId, sessionId, part.messageID, part, toolCall);
    }
  } catch (_) {
    /* session may have been removed */
  }
}

async function emitDone(chatId, sessionId) {
  await flushToolStates(chatId, sessionId);
  clearTaskChildSessionsForParent(sessionId);
  if (emitEvent) emitEvent({ type: 'done', chatId, sessionId });
}

function countDiffLines(diffText) {
  let additions = 0;
  let deletions = 0;
  if (!diffText || typeof diffText !== 'string') return { additions, deletions };
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

function countContentLines(content) {
  if (content == null || content === '') return 0;
  const lines = String(content).split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function normalizeToolPath(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  return value.replace(/\\/g, '/').trim();
}

function pathsMatch(target, candidate) {
  const a = normalizeToolPath(target);
  const b = normalizeToolPath(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(`/${b}`) || b.endsWith(`/${a}`)) return true;
  const aBase = a.split('/').pop();
  const bBase = b.split('/').pop();
  return aBase && aBase === bBase;
}

function findMatchingFileEntry(files, pathHint = '') {
  if (!Array.isArray(files) || !files.length) return null;
  if (pathHint) {
    const match = files.find((file) =>
      pathsMatch(pathHint, file.relativePath)
      || pathsMatch(pathHint, file.filePath)
      || pathsMatch(pathHint, file.movePath),
    );
    if (match) return match;
  }
  return files.length === 1 ? files[0] : null;
}

function extractDiffText(part, state, input, args) {
  const meta = state.metadata || part.metadata || {};
  const pathHint = args.path || meta.filepath || meta.file || '';
  const fileEntry = findMatchingFileEntry(meta.files, pathHint);

  if (fileEntry?.patch && typeof fileEntry.patch === 'string' && fileEntry.patch.trim()) {
    return {
      diffText: fileEntry.patch,
      path: fileEntry.relativePath || fileEntry.filePath || pathHint,
    };
  }

  const filediff = meta.filediff || meta.fileDiff;
  const diffText = meta.diff || meta.patch || filediff?.patch || filediff?.diff;
  if (typeof diffText === 'string' && diffText.trim()) {
    return { diffText, path: pathHint || fileEntry?.relativePath || '' };
  }

  if (typeof input.patchText === 'string' && input.patchText.trim()) {
    return { patchText: input.patchText, path: pathHint };
  }

  const oldText = input.oldString ?? input.old_string ?? input.oldContent;
  const newText = input.newString ?? input.new_string ?? input.newContent;
  if (oldText != null && newText != null) {
    return {
      path: pathHint,
      oldText: String(oldText),
      newText: String(newText),
    };
  }

  if (part.tool === 'write' && input.content != null) {
    return {
      path: pathHint,
      oldText: '',
      newText: String(input.content),
    };
  }

  return null;
}

function extractLineStats(part, state, input) {
  const meta = state.metadata || part.metadata || {};
  const filediff = meta.filediff || meta.fileDiff;

  if (filediff && typeof filediff === 'object') {
    return {
      additions: filediff.additions ?? 0,
      deletions: filediff.deletions ?? filediff.removals ?? 0,
    };
  }

  let additions = meta.additions ?? meta.added;
  let deletions = meta.deletions ?? meta.removals ?? meta.removed;

  const diffText = meta.diff || meta.patch || filediff?.patch;
  if ((additions == null || deletions == null) && typeof diffText === 'string') {
    const parsed = countDiffLines(diffText);
    if (additions == null) additions = parsed.additions;
    if (deletions == null) deletions = parsed.deletions;
  }

  if ((part.tool === 'write' || part.tool === 'create') && additions == null) {
    const content = input.content ?? input.text ?? input.body;
    additions = countContentLines(content);
  }

  if (additions == null || deletions == null) {
    const text = `${state.title || ''}\n${state.output || ''}`;
    const match = text.match(/\+(\d+)\s*[-/]\s*(\d+)/);
    if (match) {
      if (additions == null) additions = parseInt(match[1], 10);
      if (deletions == null) deletions = parseInt(match[2], 10);
    }
  }

  return {
    additions: additions ?? 0,
    deletions: deletions ?? 0,
  };
}

function mapToolToFrontend(part) {
  const state = part.state || {};
  const input = state.input || {};
  const frontendName = TOOL_NAME_MAP[part.tool] || part.tool;
  const status = mapToolStatus(state);
  const meta = state.metadata || part.metadata || {};
  const args = mapToolArgs(part.tool, input);

  if (!args.path && meta.filepath) args.path = meta.filepath;
  if (!args.path && meta.file) args.path = meta.file;

  const diffSource = extractDiffText(part, state, input, args);
  if (diffSource?.path && !args.path) args.path = diffSource.path;

  const { additions, deletions } = extractLineStats(part, state, input);

  const tc = {
    id: part.id,
    name: frontendName,
    args,
    status,
    result: status === 'complete' ? (state.output ?? null) : null,
    duration: state.time?.end && state.time?.start
      ? Math.max(1, state.time.end - state.time.start)
      : undefined,
    additions,
    deletions,
  };

  if (diffSource?.diffText) tc.diffText = diffSource.diffText;
  if (diffSource?.patchText && !args.patchText) args.patchText = diffSource.patchText;
  if (diffSource?.oldText != null && diffSource?.newText != null) {
    if (args.old_string == null) args.old_string = diffSource.oldText;
    if (args.new_string == null) args.new_string = diffSource.newText;
  }

  if (part.tool === 'task') {
    const childSessionId = getTaskChildSessionId(meta);
    if (childSessionId) tc.childSessionId = childSessionId;
  }

  return tc;
}

async function applyProviderAuth(provider) {
  const providerId = resolveProviderId(provider);
  if (!provider.apiKey?.trim()) return { providerId, connected: false };

  if (provider.type === 'custom') {
    const customConfig = {
      [providerId]: {
        npm: '@ai-sdk/openai-compatible',
        name: provider.name || 'Custom',
        options: {
          baseURL: provider.baseUrl?.trim() || undefined,
        },
        models: {
          default: { name: 'Default' },
        },
      },
    };

    await client.config.update({ body: { provider: customConfig } });
  }

  const result = await client.auth.set({
    path: { id: providerId },
    body: { type: 'api', key: provider.apiKey.trim() },
  });

  return { providerId, connected: !result.error };
}

function getChatIdForSession(sessionId) {
  return sessionChats.get(sessionId) || null;
}

async function replyToPermission(sessionId, permissionId, response) {
  if (!client || !sessionId || !permissionId) return { ok: false };
  try {
    const result = await client.postSessionIdPermissionsPermissionId({
      path: {
        id: sessionId,
        permissionID: permissionId,
      },
      body: { response },
      ...directoryOptions(),
    });
    if (result.error) return { ok: false, error: result.error };
    seenPermissionRequests.add(permissionId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Permission reply failed' };
  }
}

function isEnvFilePermission(permission) {
  const check = (value) => {
    if (typeof value !== 'string' || !value) return false;
    return /\.env(\.|$)/i.test(value) && !/\.env\.example$/i.test(value);
  };
  const patterns = [].concat(permission?.pattern || permission?.patterns || []);
  if (patterns.some(check)) return true;
  const filePath = permission?.metadata?.path || permission?.metadata?.file;
  return check(String(filePath || ''));
}

function needsUserConfirmation(permission) {
  if (!permission || permission.type === 'question') return false;
  if (isEnvFilePermission(permission)) return true;
  return ['bash', 'external_directory', 'doom_loop', 'webfetch', 'websearch'].includes(permission.type);
}

async function handlePermissionUpdated(permission) {
  if (!permission?.id || !permission?.sessionID) return;
  if (permission.type === 'question') return;
  if (seenPermissionRequests.has(permission.id)) return;

  if (needsUserConfirmation(permission)) {
    seenPermissionRequests.add(permission.id);
    const chatId = getChatIdForSession(permission.sessionID);
    if (!chatId || !emitEvent) return;
    emitEvent({
      type: 'permission-request',
      chatId,
      sessionId: permission.sessionID,
      permissionId: permission.id,
      permission,
    });
    return;
  }

  await replyToPermission(permission.sessionID, permission.id, 'always');
}

function questionQueryString() {
  if (!activeWorkspace) return '';
  return `?directory=${encodeURIComponent(activeWorkspace)}`;
}

async function fetchQuestionList() {
  if (!server?.url) return [];
  try {
    const res = await fetch(`${server.url}/question${questionQueryString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  } catch (_) {
    return [];
  }
}

function emitQuestionRequest(chatId, sessionId, request, toolCallId = null) {
  if (!emitEvent) return;
  const questions = request?.questions || [];
  if (!questions.length) return;

  const dedupeKey = request?.id || (toolCallId ? `tool:${toolCallId}` : null);
  if (dedupeKey && seenQuestionRequests.has(dedupeKey)) return;
  if (dedupeKey) seenQuestionRequests.add(dedupeKey);

  emitEvent({
    type: 'question-request',
    chatId,
    sessionId,
    requestId: request?.id || null,
    toolCallId,
    questions,
    tool: request?.tool || null,
  });
}

async function syncQuestionRequests(sessionId, fallback = null) {
  if (!sessionId) return;
  const chatId = getChatIdForSession(sessionId) || fallback?.chatId;
  if (!chatId) return;

  const list = await fetchQuestionList();
  const matches = list.filter((req) => req.sessionID === sessionId);
  if (matches.length) {
    for (const req of matches) emitQuestionRequest(chatId, sessionId, req);
    return;
  }

  if (fallback?.questions?.length) {
    emitQuestionRequest(chatId, sessionId, { questions: fallback.questions }, fallback.toolCallId);
  }
}

async function replyToQuestion(requestId, answers, sessionId) {
  if (!server?.url || !requestId) return { ok: false, error: 'Missing request' };

  const body = { answers };
  const qs = questionQueryString();

  try {
    const res = await fetch(
      `${server.url}/question/${encodeURIComponent(requestId)}/reply${qs}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      seenQuestionRequests.delete(requestId);
      return { ok: true };
    }

    if (sessionId) {
      const v2 = await fetch(
        `${server.url}/api/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(requestId)}/reply${qs}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (v2.ok) {
        seenQuestionRequests.delete(requestId);
        return { ok: true };
      }
    }

    return { ok: false, error: `Reply failed (${res.status})` };
  } catch (err) {
    return { ok: false, error: err.message || 'Reply failed' };
  }
}

async function rejectQuestion(requestId, sessionId) {
  if (!server?.url || !requestId) return { ok: false, error: 'Missing request' };

  const qs = questionQueryString();

  try {
    const res = await fetch(
      `${server.url}/question/${encodeURIComponent(requestId)}/reject${qs}`,
      { method: 'POST' },
    );
    if (res.ok) {
      seenQuestionRequests.delete(requestId);
      return { ok: true };
    }

    if (sessionId) {
      const v2 = await fetch(
        `${server.url}/api/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(requestId)}/reject${qs}`,
        { method: 'POST' },
      );
      if (v2.ok) {
        seenQuestionRequests.delete(requestId);
        return { ok: true };
      }
    }

    return { ok: false, error: `Reject failed (${res.status})` };
  } catch (err) {
    return { ok: false, error: err.message || 'Reject failed' };
  }
}

function handleBusEvent(event) {
  if (!emitEvent || !event?.type) return;

  switch (event.type) {
    case 'message.part.updated': {
      const part = event.properties?.part;
      if (!part?.sessionID) break;

      if (taskChildSessions.has(part.sessionID)) {
        emitSubAgentActivityFromChildPart(part, event.properties?.delta);
      }

      const chatId = getChatIdForSession(part.sessionID);
      if (!chatId) break;

      const role = messageRoles.get(part.messageID);
      if (role === 'user') break;

      if (part.type === 'text') {
        const delta = event.properties?.delta;
        const full = part.text;
        if (delta) {
          emitEvent({
            type: 'text-delta',
            chatId,
            sessionId: part.sessionID,
            messageId: part.messageID,
            text: delta,
          });
        } else if (full) {
          emitEvent({
            type: 'text-full',
            chatId,
            sessionId: part.sessionID,
            messageId: part.messageID,
            text: full,
          });
        }
      }

      if (part.type === 'tool') {
        messageRoles.set(part.messageID, 'assistant');
        const toolCall = mapToolToFrontend(part);
        const input = part.state?.input || {};
        void emitToolUpdate(chatId, part.sessionID, part.messageID, part, toolCall);
        if (
          part.tool === 'question'
          && (toolCall.status === 'pending' || toolCall.status === 'running')
        ) {
          const questions = input.questions || toolCall.args?.questions;
          void syncQuestionRequests(part.sessionID, {
            chatId,
            questions,
            toolCallId: part.id,
          });
        }
      }
      break;
    }

    case 'question.asked':
    case 'question.v2.asked': {
      const request = event.properties;
      if (!request?.sessionID || !request?.id) break;
      const chatId = getChatIdForSession(request.sessionID);
      if (!chatId) break;
      emitQuestionRequest(chatId, request.sessionID, request);
      break;
    }

    case 'question.replied':
    case 'question.v2.replied':
    case 'question.rejected':
    case 'question.v2.rejected': {
      const requestId = event.properties?.requestID || event.properties?.id;
      if (requestId) seenQuestionRequests.delete(requestId);
      break;
    }

    case 'message.updated': {
      const info = event.properties?.info;
      if (!info?.sessionID || !info?.id) break;
      if (info.role) messageRoles.set(info.id, info.role);
      const chatId = getChatIdForSession(info.sessionID);
      if (!chatId) break;

      if (info.role === 'assistant' && info.error) {
        const run = activeRuns.get(chatId);
        if (isKnownAssistantMessage(info.id, run?.knownAssistantIds)) break;
        emitEvent({
          type: 'assistant-message',
          chatId,
          sessionId: info.sessionID,
          messageId: info.id,
          error: info.error,
          completed: true,
        });
      }
      break;
    }

    case 'session.idle': {
      const sessionId = event.properties?.sessionID;
      const chatId = getChatIdForSession(sessionId);
      if (!chatId) break;
      activeRuns.delete(chatId);
      void emitDone(chatId, sessionId);
      break;
    }

    case 'permission.updated':
    case 'permission.asked': {
      void handlePermissionUpdated(event.properties);
      break;
    }

    case 'permission.replied': {
      const permissionId = event.properties?.permissionID || event.properties?.requestID;
      if (permissionId) seenPermissionRequests.add(permissionId);
      break;
    }

    default:
      break;
  }
}

async function startEventSubscription() {
  if (eventLoop || !client) return;

  eventLoopDone = (async () => {
    while (client) {
      try {
        const events = await client.event.subscribe();
        for await (const event of events.stream) {
          if (!client) break;
          handleBusEvent(event);
        }
      } catch (err) {
        if (!client) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();

  eventLoop = eventLoopDone;
}

export async function startOpencodeService(options = {}) {
  if (options.onEvent) emitEvent = options.onEvent;
  if (server && client) return getStatus();

  const { ensureOpencodeInstalled } = await import('./ensure-opencode.mjs');
  await ensureOpencodeInstalled();

  ensureOpencodeOnPath();
  if (!emitEvent) emitEvent = options.onEvent || null;

  const preferredPort = options.port || 4096;
  const preferredUrl = `http://127.0.0.1:${preferredPort}`;

  if (await isOpencodeHealthy(preferredUrl)) {
    return attachToServer(preferredUrl);
  }

  const fallbackPort = await getAvailablePort();
  const portsToTry = [...new Set([preferredPort, fallbackPort])];
  let lastError = null;

  for (const port of portsToTry) {
    try {
      return await spawnServer(port, options);
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err);
      if (!msg.includes('exited with code') && !msg.includes('ServeError')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Failed to start OpenCode server');
}

export function setEventEmitter(fn) {
  emitEvent = fn;
}

export async function stopOpencodeService() {
  const pendingLoop = eventLoopDone;
  client = null;

  if (server && serverOwned) {
    server.close();
  }
  server = null;
  serverOwned = false;

  if (pendingLoop) {
    await Promise.race([
      pendingLoop.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }

  eventLoop = null;
  eventLoopDone = null;
  chatSessions.clear();
  sessionChats.clear();
  chatWorkspaces.clear();
  activeRuns.clear();
  messageRoles.clear();
}

export function getStatus() {
  return {
    running: Boolean(server && client),
    url: server?.url || null,
    workspace: APP_ROOT,
  };
}

export async function syncProviders(providers = []) {
  if (!client) throw new Error('OpenCode server is not running');

  const results = [];
  for (const provider of providers) {
    if (!provider.enabled) {
      results.push({
        id: provider.id,
        providerId: resolveProviderId(provider),
        ok: true,
        skipped: true,
      });
      continue;
    }

    if (!provider.apiKey?.trim()) {
      results.push({
        id: provider.id,
        providerId: resolveProviderId(provider),
        ok: false,
        error: 'API key required',
      });
      continue;
    }

    if (provider.type === 'custom' && !provider.baseUrl?.trim()) {
      results.push({
        id: provider.id,
        providerId: resolveProviderId(provider),
        ok: false,
        error: 'Base URL required',
      });
      continue;
    }

    try {
      const applied = await applyProviderAuth(provider);
      const list = await client.provider.list();
      const connected = list.data?.connected || [];
      results.push({
        id: provider.id,
        providerId: applied.providerId,
        ok: connected.includes(applied.providerId),
      });
    } catch (err) {
      results.push({
        id: provider.id,
        providerId: resolveProviderId(provider),
        ok: false,
        error: err.message || 'Failed to configure provider',
      });
    }
  }

  return results;
}

export async function testProvider(provider) {
  if (!client) throw new Error('OpenCode server is not running');
  const applied = await applyProviderAuth(provider);
  const list = await client.provider.list();
  const connected = list.data?.connected || [];
  return {
    ok: connected.includes(applied.providerId),
    providerId: applied.providerId,
    connected,
  };
}

export async function getProviderStatus() {
  if (!client) return { connected: [], all: [] };
  const list = await client.provider.list();
  return {
    connected: list.data?.connected || [],
    all: (list.data?.all || []).map((p) => ({ id: p.id, name: p.name })),
  };
}

export async function getAvailableModels(providers = []) {
  if (!client) return [];

  const list = await client.provider.list();
  const allProviders = list.data?.all || [];
  const connected = new Set(list.data?.connected || []);

  const enabledProviderIds = new Set(
    providers
      .filter((p) => p.enabled && p.apiKey?.trim())
      .map((p) => resolveProviderId(p)),
  );

  const freeProviders = new Set(['opencode']);
  const gatewayProviders = new Set(['openrouter']);
  const models = [];

  for (const provider of allProviders) {
    const isBuiltin = Object.values(BUILTIN_PROVIDER_TYPES).includes(provider.id);
    const isCustom = provider.id.startsWith('custom-');
    const isGateway = gatewayProviders.has(provider.id);
    const userConfigured = enabledProviderIds.has(provider.id);
    const isFree = freeProviders.has(provider.id);
    const isConnected = connected.has(provider.id);

    if (isBuiltin || isCustom) {
      if (!userConfigured || !isConnected) continue;
    } else if (isFree) {
      if (!isConnected) continue;
    } else if (isGateway) {
      if (!isConnected) continue;
      if (!userConfigured) continue;
    } else {
      continue;
    }

    for (const [modelId, model] of Object.entries(provider.models || {})) {
      models.push({
        id: `${provider.id}/${modelId}`,
        name: model.name || modelId,
        category: categoryForProvider(provider),
        providerId: provider.id,
        modelId,
        providerName: provider.name,
      });
    }
  }

  models.sort((a, b) => {
    const byCategory = a.category.localeCompare(b.category);
    if (byCategory !== 0) return byCategory;
    return a.name.localeCompare(b.name);
  });
  return models;
}

function registerChatSession(chatId, sessionId, workspace) {
  if (!chatId || !sessionId) return;
  chatSessions.set(chatId, sessionId);
  sessionChats.set(sessionId, chatId);
  if (workspace) chatWorkspaces.set(chatId, workspace);
}

async function verifySessionExists(sessionId, workspace) {
  if (!client || !sessionId) return false;
  try {
    const result = await client.session.get({
      path: { id: sessionId },
      ...directoryOptions(workspace),
    });
    return !result.error && Boolean(result.data?.id);
  } catch {
    return false;
  }
}

async function sessionMessageCount(sessionId, workspace) {
  if (!client || !sessionId) return 0;
  try {
    const result = await client.session.messages({
      path: { id: sessionId },
      ...directoryOptions(workspace),
    });
    return (result.data || []).filter((entry) => {
      const role = entry.info?.role;
      return role === 'user' || role === 'assistant';
    }).length;
  } catch {
    return 0;
  }
}

function extractTranscriptFromSession(messages = []) {
  const transcript = [];
  for (const entry of messages) {
    const role = entry.info?.role;
    if (role !== 'user' && role !== 'assistant') continue;

    let content = '';
    const toolCalls = [];
    for (const part of entry.parts || []) {
      if (part.type === 'text' && part.text) content += part.text;
      if (part.type === 'tool') toolCalls.push(mapToolToFrontend(part));
    }

    if (content.trim() || toolCalls.length) {
      transcript.push({
        role,
        content: content.trim(),
        toolCalls,
      });
    }
  }
  return transcript;
}

export async function fetchSessionMessages(sessionId, workspace) {
  if (!client || !sessionId) return [];
  try {
    const result = await client.session.messages({
      path: { id: sessionId },
      ...directoryOptions(workspace),
    });
    return extractTranscriptFromSession(result.data || []);
  } catch {
    return [];
  }
}

async function serverLacksLocalHistory(sessionId, workspace, history = []) {
  if (!history.length) return false;
  const transcript = await fetchSessionMessages(sessionId, workspace);
  if (!transcript.length) return true;

  for (const localEntry of history) {
    if (!localEntry.content?.trim()) continue;
    const localText = localEntry.content.trim();
    const found = transcript.some(
      (entry) => entry.role === localEntry.role && entry.content?.trim() === localText,
    );
    if (!found) return true;
  }
  return false;
}

async function sessionNeedsHistoryResync(sessionId, workspace, history = []) {
  if (!history.length) return false;
  const transcript = await fetchSessionMessages(sessionId, workspace);
  if (!transcript.length) return true;

  const lastServer = transcript[transcript.length - 1];
  // After abort the session often ends on a user turn with no assistant reply.
  if (lastServer?.role === 'user') return true;

  return false;
}

function formatHistoryContext(history = []) {
  const lines = history
    .filter((entry) => entry?.content?.trim())
    .map((entry) => {
      const label = entry.role === 'assistant' ? 'Assistant' : 'User';
      return `${label}: ${entry.content.trim()}`;
    });
  if (!lines.length) return '';
  return `[Continuing previous conversation]\n${lines.join('\n\n')}\n\n---\n\n`;
}

async function getOrCreateSession(chatId, title, knownSessionId, workspace) {
  if (chatSessions.has(chatId)) return chatSessions.get(chatId);

  if (knownSessionId && await verifySessionExists(knownSessionId, workspace)) {
    registerChatSession(chatId, knownSessionId, workspace);
    return knownSessionId;
  }

  const result = await client.session.create({
    body: { title: title || 'New chat' },
    ...directoryOptions(workspace),
  });

  const sessionId = result.data?.id;
  if (!sessionId) throw new Error('Failed to create OpenCode session');

  registerChatSession(chatId, sessionId, workspace);
  return sessionId;
}

export async function restoreChatSessions(mappings = []) {
  if (!client) return { restored: 0, failed: 0 };
  let restored = 0;
  let failed = 0;

  for (const { chatId, sessionId, workspace } of mappings) {
    if (!chatId || !sessionId || chatSessions.has(chatId)) continue;
    if (await verifySessionExists(sessionId, workspace)) {
      registerChatSession(chatId, sessionId, workspace);
      restored += 1;
    } else {
      failed += 1;
    }
  }

  return { restored, failed };
}

export async function sendChatMessage({ chatId, text, modelId, title, sessionId, history, workspace, forceHistory }) {
  if (!client) throw new Error('OpenCode server is not running');
  if (!text?.trim()) throw new Error('Message is required');
  if (!modelId) throw new Error('Model is required');

  if (workspace) {
    activeWorkspace = workspace;
    chatWorkspaces.set(chatId, workspace);
  }

  const resolvedSessionId = await getOrCreateSession(chatId, title, sessionId, workspace);
  const slash = modelId.indexOf('/');
  const providerID = slash >= 0 ? modelId.slice(0, slash) : 'openai';
  const modelID = slash >= 0 ? modelId.slice(slash + 1) : modelId;

  let messageText = text.trim();
  const createdNewSession = !sessionId || resolvedSessionId !== sessionId;
  const serverMessageCount = await sessionMessageCount(resolvedSessionId, workspace);
  const lacksLocalHistory = history?.length
    ? await serverLacksLocalHistory(resolvedSessionId, workspace, history)
    : false;
  const needsHistoryResync = history?.length
    ? await sessionNeedsHistoryResync(resolvedSessionId, workspace, history)
    : false;
  const needsHistory = history?.length && (
    forceHistory || createdNewSession || serverMessageCount === 0 || lacksLocalHistory || needsHistoryResync
  );
  if (needsHistory) {
    messageText = formatHistoryContext(history) + messageText;
  }

  const knownAssistantIds = await getAssistantMessageIds(resolvedSessionId, workspace);
  activeRuns.set(chatId, { sessionId: resolvedSessionId, modelId, knownAssistantIds });

  await client.session.promptAsync({
    path: { id: resolvedSessionId },
    body: {
      model: { providerID, modelID },
      parts: [{ type: 'text', text: messageText }],
    },
    ...directoryOptions(workspace),
  });

  pollSessionResponse(chatId, resolvedSessionId, workspace, knownAssistantIds).catch((err) => {
    if (emitEvent) {
      emitEvent({
        type: 'error',
        chatId,
        message: err.message || 'Failed to get AI response',
      });
    }
  });

  return { sessionId: resolvedSessionId, providerID, modelID };
}

export async function abortChat(chatId) {
  if (!client) return false;
  const sessionId = chatSessions.get(chatId);
  if (!sessionId) return false;

  const result = await client.session.abort({ path: { id: sessionId } });
  activeRuns.delete(chatId);
  if (!result.error) {
    await emitDone(chatId, sessionId);
  }
  return !result.error;
}

export function isChatRunning(chatId) {
  return activeRuns.has(chatId);
}

export async function replyQuestion({ requestId, answers, sessionId }) {
  if (!client) throw new Error('OpenCode server is not running');
  return replyToQuestion(requestId, answers, sessionId);
}

export async function rejectQuestionRequest({ requestId, sessionId }) {
  if (!client) throw new Error('OpenCode server is not running');
  return rejectQuestion(requestId, sessionId);
}

export async function listPendingQuestions(sessionId) {
  if (!client) return [];
  const list = await fetchQuestionList();
  if (!sessionId) return list;
  return list.filter((req) => req.sessionID === sessionId);
}

export async function resolveQuestionRequestId(sessionId) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await fetchQuestionList();
    const match = list.find((req) => req.sessionID === sessionId);
    if (match?.id) return match.id;
    await sleep(250);
  }
  return null;
}

export async function replyPermission({ sessionId, permissionId, response }) {
  if (!client) throw new Error('OpenCode server is not running');
  return replyToPermission(sessionId, permissionId, response);
}
