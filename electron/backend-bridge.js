const { ipcMain } = require('electron');
const { logError } = require('./log-service');

let service = null;
let serviceReady = null;
let startFailed = false;

async function loadService() {
  if (service) return service;
  service = await import('./opencode-service.mjs');
  return service;
}

function getMainWindow(getWindow) {
  const win = typeof getWindow === 'function' ? getWindow() : getWindow;
  return win && !win.isDestroyed() ? win : null;
}

function broadcast(getWindow, channel, payload) {
  const win = getMainWindow(getWindow);
  if (win) win.webContents.send(channel, payload);
}

function formatStartError(err) {
  const msg = String(err?.message || err || 'Unknown error');
  if (msg.includes('exited with code') || msg.includes('ServeError')) {
    return 'OpenCode server could not start. Close other OpenCode instances and restart the app.';
  }
  return msg;
}

async function ensureStarted(getWindow, workspace) {
  const mod = await loadService();
  if (mod.getStatus().running) return mod;
  if (startFailed && !serviceReady) {
    throw new Error('OpenCode backend failed to start earlier');
  }

  if (!serviceReady) {
    serviceReady = mod.startOpencodeService({
      workspace,
      onEvent: (event) => broadcast(getWindow, 'backend:event', event),
    });
  }

  try {
    await serviceReady;
    startFailed = false;
    return mod;
  } catch (err) {
    serviceReady = null;
    startFailed = true;
    logError('backend', 'OpenCode service failed to start', err);
    throw err;
  }
}

async function safeCall(getWindow, getWorkspace, operation, fn, details = {}) {
  try {
    const mod = await ensureStarted(getWindow, getWorkspace());
    return await fn(mod);
  } catch (err) {
    logError('backend', `Backend operation failed: ${operation}`, {
      operation,
      ...details,
      error: err,
    });
    return { ok: false, running: false, error: formatStartError(err) };
  }
}

function registerBackendHandlers({ getMainWindow, getWorkspace }) {
  ipcMain.handle('backend:status', async () => {
    const mod = await loadService();
    return mod.getStatus();
  });

  ipcMain.handle('backend:start', async () => {
    try {
      const mod = await ensureStarted(getMainWindow, getWorkspace());
      return mod.getStatus();
    } catch (err) {
      logError('backend', 'Backend start handler failed', err);
      return { running: false, error: formatStartError(err) };
    }
  });

  ipcMain.handle('backend:sync-providers', async (_evt, providers) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'sync-providers',
      (mod) => mod.syncProviders(providers),
      { providerCount: Array.isArray(providers) ? providers.length : 0 },
    );
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:test-provider', async (_evt, provider) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'test-provider',
      (mod) => mod.testProvider(provider),
      { providerId: provider?.id, providerType: provider?.type },
    );
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:get-models', async (_evt, providers) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'get-models',
      (mod) => mod.getAvailableModels(providers),
      { providerCount: Array.isArray(providers) ? providers.length : 0 },
    );
    if (result?.error) return [];
    return result;
  });

  ipcMain.handle('backend:send-message', async (_evt, payload) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'send-message',
      (mod) => mod.sendChatMessage(payload),
      {
        chatId: payload?.chatId,
        modelId: payload?.modelId,
        sessionId: payload?.sessionId,
        messageLength: typeof payload?.message === 'string' ? payload.message.length : 0,
      },
    );
    if (result?.error) throw new Error(result.error);
    return result;
  });

  ipcMain.handle('backend:restore-sessions', async (_evt, mappings) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'restore-sessions',
      (mod) => mod.restoreChatSessions(mappings),
      { mappingCount: Array.isArray(mappings) ? mappings.length : 0 },
    );
    if (result?.error) return { restored: 0, failed: 0, error: result.error };
    return result;
  });

  ipcMain.handle('backend:fetch-session-messages', async (_evt, payload) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'fetch-session-messages',
      (mod) => mod.fetchSessionMessages(payload.sessionId, payload.workspace),
      { sessionId: payload?.sessionId, workspace: payload?.workspace },
    );
    if (result?.error) return [];
    return result;
  });

  ipcMain.handle('backend:abort', async (_evt, chatId) => {
    const mod = await loadService();
    if (!mod?.getStatus().running) return false;
    return mod.abortChat(chatId);
  });

  ipcMain.handle('backend:set-workspace', async (_evt, folderPath) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'set-workspace',
      (mod) => mod.setWorkspace(folderPath),
      { folderPath },
    );
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:reply-question', async (_evt, payload) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'reply-question',
      (mod) => mod.replyQuestion(payload),
      { requestId: payload?.requestId, sessionId: payload?.sessionId },
    );
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:reject-question', async (_evt, payload) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'reject-question',
      (mod) => mod.rejectQuestionRequest(payload),
      { requestId: payload?.requestId, sessionId: payload?.sessionId },
    );
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:list-questions', async (_evt, sessionId) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'list-questions',
      (mod) => mod.listPendingQuestions(sessionId),
      { sessionId },
    );
    if (result?.error) return [];
    return result;
  });

  ipcMain.handle('backend:resolve-question-id', async (_evt, sessionId) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'resolve-question-id',
      (mod) => mod.resolveQuestionRequestId(sessionId),
      { sessionId },
    );
    if (result?.error) return null;
    return result;
  });

  ipcMain.handle('backend:reply-permission', async (_evt, payload) => {
    const result = await safeCall(
      getMainWindow,
      getWorkspace,
      'reply-permission',
      (mod) => mod.replyPermission(payload),
      {
        permissionId: payload?.permissionId,
        sessionId: payload?.sessionId,
        response: payload?.response,
      },
    );
    if (result?.error) return result;
    return result;
  });
}

async function shutdownBackend() {
  if (!service) return;
  await service.stopOpencodeService();
  service = null;
  serviceReady = null;
  startFailed = false;
}

module.exports = {
  registerBackendHandlers,
  shutdownBackend,
  ensureStarted,
};
