const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  quit: () => ipcRenderer.send('window-quit'),
  onWindowState: (cb) => ipcRenderer.on('window-state', (_, state) => cb(state)),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openAttachmentDialog: () => ipcRenderer.invoke('dialog:open-attachments'),
  openImageDialog: () => ipcRenderer.invoke('dialog:open-images'),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:save-file', options),
  writeTextFile: (payload) => ipcRenderer.invoke('fs:write-text-file', payload),
  describeImages: (payload) => ipcRenderer.invoke('openrouter:describe-images', payload),
  signalShellReady: () => ipcRenderer.send('app-shell-ready'),
  signalAppReady: () => ipcRenderer.send('app-ready'),
  saveChatsSync: (data) => ipcRenderer.sendSync('chats:save-sync', data),
  loadChatsSync: () => ipcRenderer.sendSync('chats:load-sync'),
  deleteChatsSync: () => ipcRenderer.sendSync('chats:delete-sync'),
  onAppSaveState: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('app-save-state', listener);
    return () => ipcRenderer.removeListener('app-save-state', listener);
  },
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (cb) => {
    const listener = (_, status) => cb(status);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  onBeginInstall: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('updates:begin-install', listener);
    return () => ipcRenderer.removeListener('updates:begin-install', listener);
  },
});

contextBridge.exposeInMainWorld('backendAPI', {
  status: () => ipcRenderer.invoke('backend:status'),
  start: () => ipcRenderer.invoke('backend:start'),
  syncProviders: (providers) => ipcRenderer.invoke('backend:sync-providers', providers),
  testProvider: (provider) => ipcRenderer.invoke('backend:test-provider', provider),
  getModels: (providers) => ipcRenderer.invoke('backend:get-models', providers),
  sendMessage: (payload) => ipcRenderer.invoke('backend:send-message', payload),
  restoreSessions: (mappings) => ipcRenderer.invoke('backend:restore-sessions', mappings),
  fetchSessionMessages: (payload) => ipcRenderer.invoke('backend:fetch-session-messages', payload),
  abort: (chatId) => ipcRenderer.invoke('backend:abort', chatId),
  setWorkspace: (folderPath) => ipcRenderer.invoke('backend:set-workspace', folderPath),
  replyQuestion: (payload) => ipcRenderer.invoke('backend:reply-question', payload),
  rejectQuestion: (payload) => ipcRenderer.invoke('backend:reject-question', payload),
  listQuestions: (sessionId) => ipcRenderer.invoke('backend:list-questions', sessionId),
  resolveQuestionRequestId: (sessionId) => ipcRenderer.invoke('backend:resolve-question-id', sessionId),
  replyPermission: (payload) => ipcRenderer.invoke('backend:reply-permission', payload),
  onEvent: (cb) => {
    const listener = (_, event) => cb(event);
    ipcRenderer.on('backend:event', listener);
    return () => ipcRenderer.removeListener('backend:event', listener);
  },
});
