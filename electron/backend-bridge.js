const { ipcMain } = require('electron');

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
    throw err;
  }
}

async function safeCall(getWindow, getWorkspace, fn) {
  try {
    const mod = await ensureStarted(getWindow, getWorkspace());
    return await fn(mod);
  } catch (err) {
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
      return { running: false, error: formatStartError(err) };
    }
  });

  ipcMain.handle('backend:sync-providers', async (_evt, providers) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.syncProviders(providers));
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:test-provider', async (_evt, provider) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.testProvider(provider));
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:get-models', async (_evt, providers) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.getAvailableModels(providers));
    if (result?.error) return [];
    return result;
  });

  ipcMain.handle('backend:send-message', async (_evt, payload) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.sendChatMessage(payload));
    if (result?.error) throw new Error(result.error);
    return result;
  });

  ipcMain.handle('backend:restore-sessions', async (_evt, mappings) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.restoreChatSessions(mappings));
    if (result?.error) return { restored: 0, failed: 0, error: result.error };
    return result;
  });

  ipcMain.handle('backend:fetch-session-messages', async (_evt, payload) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.fetchSessionMessages(payload.sessionId, payload.workspace));
    if (result?.error) return [];
    return result;
  });

  ipcMain.handle('backend:abort', async (_evt, chatId) => {
    const mod = await loadService();
    if (!mod?.getStatus().running) return false;
    return mod.abortChat(chatId);
  });

  ipcMain.handle('backend:set-workspace', async (_evt, folderPath) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.setWorkspace(folderPath));
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:reply-question', async (_evt, payload) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.replyQuestion(payload));
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:reject-question', async (_evt, payload) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.rejectQuestionRequest(payload));
    if (result?.error) return result;
    return result;
  });

  ipcMain.handle('backend:list-questions', async (_evt, sessionId) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.listPendingQuestions(sessionId));
    if (result?.error) return [];
    return result;
  });

  ipcMain.handle('backend:resolve-question-id', async (_evt, sessionId) => {
    const result = await safeCall(getMainWindow, getWorkspace, (mod) => mod.resolveQuestionRequestId(sessionId));
    if (result?.error) return null;
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
