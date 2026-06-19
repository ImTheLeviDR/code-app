/* ============================================================
   BACKEND CLIENT - IPC bridge to OpenCode service
   ============================================================ */

'use strict';

const Backend = (() => {
  let cachedModels = null;
  let eventUnsubscribe = null;
  const eventHandlers = new Set();

  function isAvailable() {
    return typeof window.backendAPI !== 'undefined';
  }

  async function ensureReady() {
    if (!isAvailable()) return { running: false };
    try {
      const status = await window.backendAPI.status();
      if (status?.running) return status;
      const started = await window.backendAPI.start();
      if (!started?.running) {
        return { running: false, error: started?.error || 'Failed to start backend' };
      }
      return started;
    } catch (err) {
      console.error('Backend start failed:', err);
      return { running: false, error: err.message };
    }
  }

  async function syncProviders(providers) {
    if (!isAvailable()) return [];
    await ensureReady();
    return window.backendAPI.syncProviders(providers);
  }

  async function testProvider(provider) {
    if (!isAvailable()) return { ok: false, error: 'Backend unavailable' };
    await ensureReady();
    return window.backendAPI.testProvider(provider);
  }

  async function getModels(providers) {
    if (!isAvailable()) return null;
    await ensureReady();
    const models = await window.backendAPI.getModels(providers);
    cachedModels = models;
    return models;
  }

  function getCachedModels() {
    return cachedModels;
  }

  async function sendMessage(payload) {
    if (!isAvailable()) throw new Error('Backend unavailable');
    await ensureReady();
    return window.backendAPI.sendMessage(payload);
  }

  async function restoreChatSessions(mappings) {
    if (!isAvailable()) return { restored: 0, failed: 0 };
    await ensureReady();
    return window.backendAPI.restoreSessions(mappings);
  }

  async function fetchSessionMessages(sessionId, workspace) {
    if (!isAvailable()) return [];
    await ensureReady();
    return window.backendAPI.fetchSessionMessages({ sessionId, workspace });
  }

  async function abort(chatId) {
    if (!isAvailable()) return false;
    return window.backendAPI.abort(chatId);
  }

  async function setWorkspace(folderPath) {
    if (!isAvailable()) return null;
    await ensureReady();
    return window.backendAPI.setWorkspace(folderPath);
  }

  async function replyQuestion(payload) {
    if (!isAvailable()) throw new Error('Backend unavailable');
    await ensureReady();
    return window.backendAPI.replyQuestion(payload);
  }

  async function rejectQuestion(payload) {
    if (!isAvailable()) return { ok: false, error: 'Backend unavailable' };
    await ensureReady();
    return window.backendAPI.rejectQuestion(payload);
  }

  async function listQuestions(sessionId) {
    if (!isAvailable()) return [];
    await ensureReady();
    return window.backendAPI.listQuestions(sessionId);
  }

  async function resolveQuestionRequestId(sessionId) {
    if (!isAvailable()) return null;
    await ensureReady();
    return window.backendAPI.resolveQuestionRequestId(sessionId);
  }

  async function replyPermission(payload) {
    if (!isAvailable()) throw new Error('Backend unavailable');
    await ensureReady();
    return window.backendAPI.replyPermission(payload);
  }

  function onEvent(handler) {
    eventHandlers.add(handler);
    if (!eventUnsubscribe && isAvailable()) {
      eventUnsubscribe = window.backendAPI.onEvent((event) => {
        eventHandlers.forEach((fn) => fn(event));
      });
    }
    return () => eventHandlers.delete(handler);
  }

  return {
    isAvailable,
    ensureReady,
    syncProviders,
    testProvider,
    getModels,
    getCachedModels,
    sendMessage,
    restoreChatSessions,
    fetchSessionMessages,
    abort,
    setWorkspace,
    replyQuestion,
    rejectQuestion,
    listQuestions,
    resolveQuestionRequestId,
    replyPermission,
    onEvent,
  };
})();
