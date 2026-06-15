import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createOpencodeClient } from '@opencode-ai/sdk/client';
import { createOpencodeServer } from '@opencode-ai/sdk/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..');

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

function directoryOptions() {
  return activeWorkspace ? { query: { directory: activeWorkspace } } : {};
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
const activeRuns = new Map();
const activePolls = new Set();
const messageRoles = new Map();
const seenQuestionRequests = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLatestAssistantEntry(messages = []) {
  const assistants = messages.filter((entry) => entry.info?.role === 'assistant');
  return assistants[assistants.length - 1] || null;
}

async function pollSessionResponse(chatId, sessionId) {
  if (activePolls.has(sessionId)) return;
  activePolls.add(sessionId);

  let lastText = '';
  const seenTools = new Map();

  try {
    let idlePolls = 0;
    let lastActivity = Date.now();
    const IDLE_POLL_LIMIT = 16; // 8s of continuous idle with no response text

    for (let attempt = 0; ; attempt++) {
      if (!client || !chatSessions.has(chatId)) return;

      const [statusRes, msgRes] = await Promise.all([
        client.session.status({ ...directoryOptions() }),
        client.session.messages({
          path: { id: sessionId },
          ...directoryOptions(),
        }),
      ]);

      const sessionStatus = statusRes.data?.[sessionId];
      const isBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
      const latest = getLatestAssistantEntry(msgRes.data || []);

      if (latest?.info?.error && emitEvent) {
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

      if (latest?.parts?.length && emitEvent) {
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
              emitEvent({
                type: 'tool-update',
                chatId,
                sessionId,
                messageId: part.messageID,
                toolCall: mapped,
              });
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
            }
          }
        }
      }

      const completed = Boolean(latest?.info?.time?.completed);
      if (completed && lastText) {
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

      // Not busy and no recent activity — check exit conditions
      if (!lastText && attempt >= 8) {
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

      idlePolls++;
      if (idlePolls >= IDLE_POLL_LIMIT) {
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
  try {
    const msgRes = await client.session.messages({
      path: { id: sessionId },
      ...directoryOptions(),
    });
    const latest = getLatestAssistantEntry(msgRes.data || []);
    for (const part of latest?.parts || []) {
      if (part.type !== 'tool') continue;
      emitEvent({
        type: 'tool-update',
        chatId,
        sessionId,
        messageId: part.messageID,
        toolCall: mapToolToFrontend(part),
      });
    }
  } catch (_) {
    /* session may have been removed */
  }
}

async function emitDone(chatId, sessionId) {
  await flushToolStates(chatId, sessionId);
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

async function approvePermission(permission) {
  if (!client || !permission?.id || !permission?.sessionID) return;
  if (permission.type === 'question') return;
  try {
    await client.postSessionIdPermissionsPermissionId({
      path: {
        id: permission.sessionID,
        permissionID: permission.id,
      },
      body: { response: 'allow', remember: true },
    });
  } catch (_) {
    /* permission may have expired */
  }
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
        emitEvent({
          type: 'tool-update',
          chatId,
          sessionId: part.sessionID,
          messageId: part.messageID,
          toolCall,
        });
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

    case 'permission.updated': {
      approvePermission(event.properties);
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

async function getOrCreateSession(chatId, title) {
  if (chatSessions.has(chatId)) return chatSessions.get(chatId);

  const result = await client.session.create({
    body: { title: title || 'New chat' },
    ...directoryOptions(),
  });

  const sessionId = result.data?.id;
  if (!sessionId) throw new Error('Failed to create OpenCode session');

  chatSessions.set(chatId, sessionId);
  sessionChats.set(sessionId, chatId);
  return sessionId;
}

export async function sendChatMessage({ chatId, text, modelId, title }) {
  if (!client) throw new Error('OpenCode server is not running');
  if (!text?.trim()) throw new Error('Message is required');
  if (!modelId) throw new Error('Model is required');

  const sessionId = await getOrCreateSession(chatId, title);
  const slash = modelId.indexOf('/');
  const providerID = slash >= 0 ? modelId.slice(0, slash) : 'openai';
  const modelID = slash >= 0 ? modelId.slice(slash + 1) : modelId;

  activeRuns.set(chatId, { sessionId, modelId });

  await client.session.promptAsync({
    path: { id: sessionId },
    body: {
      model: { providerID, modelID },
      parts: [{ type: 'text', text: text.trim() }],
    },
    ...directoryOptions(),
  });

  pollSessionResponse(chatId, sessionId).catch((err) => {
    if (emitEvent) {
      emitEvent({
        type: 'error',
        chatId,
        message: err.message || 'Failed to get AI response',
      });
    }
  });

  return { sessionId, providerID, modelID };
}

export async function abortChat(chatId) {
  if (!client) return false;
  const sessionId = chatSessions.get(chatId);
  if (!sessionId) return false;

  const result = await client.session.abort({ path: { id: sessionId } });
  activeRuns.delete(chatId);
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
