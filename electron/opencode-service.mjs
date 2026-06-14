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
  read: 'read_file',
  write: 'write_file',
  edit: 'edit_file',
  apply_patch: 'edit_file',
  bash: 'run_terminal_cmd',
  grep: 'search_codebase',
  glob: 'search_files',
  websearch: 'search_codebase',
  webfetch: 'search_files',
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
    for (let attempt = 0; attempt < 180; attempt++) {
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
        emitEvent({ type: 'done', chatId, sessionId });
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
              emitEvent({
                type: 'tool-update',
                chatId,
                sessionId,
                messageId: part.messageID,
                toolCall: mapped,
              });
            }
          }
        }
      }

      const completed = Boolean(latest?.info?.time?.completed);
      if (completed && lastText) {
        if (emitEvent) {
          emitEvent({ type: 'done', chatId, sessionId });
        }
        activeRuns.delete(chatId);
        return;
      }

      if (!isBusy && !completed && attempt >= 8 && !lastText) {
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
    }

    if (emitEvent) {
      emitEvent({
        type: 'error',
        chatId,
        message: 'Response timed out. Check your model and provider API key in Settings.',
      });
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
  if (args.pattern && !args.query) args.query = args.pattern;
  if (args.command && toolName === 'bash') return { command: args.command };
  if (args.path) return { path: args.path, ...args };
  return args;
}

function mapToolToFrontend(part) {
  const state = part.state || {};
  const input = state.input || {};
  const frontendName = TOOL_NAME_MAP[part.tool] || part.tool;
  const status = state.status === 'completed'
    ? 'complete'
    : state.status === 'error'
      ? 'complete'
      : state.status === 'running'
        ? 'running'
        : 'pending';

  const tc = {
    id: part.id,
    name: frontendName,
    args: mapToolArgs(part.tool, input),
    status,
    result: state.status === 'completed' ? state.output : null,
    duration: state.time?.end && state.time?.start
      ? Math.max(1, state.time.end - state.time.start)
      : undefined,
  };

  const meta = state.metadata || {};
  if (meta.additions != null) tc.additions = meta.additions;
  if (meta.deletions != null) tc.deletions = meta.deletions;

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

function handleBusEvent(event) {
  if (!emitEvent || !event?.type) return;

  switch (event.type) {
    case 'message.part.updated': {
      const part = event.properties?.part;
      if (!part?.sessionID) break;
      const chatId = getChatIdForSession(part.sessionID);
      if (!chatId) break;

      const role = messageRoles.get(part.messageID);
      if (role !== 'assistant') break;

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
        emitEvent({
          type: 'tool-update',
          chatId,
          sessionId: part.sessionID,
          messageId: part.messageID,
          toolCall: mapToolToFrontend(part),
        });
      }
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
      emitEvent({ type: 'done', chatId, sessionId });
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
