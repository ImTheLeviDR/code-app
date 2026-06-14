const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  quit: () => ipcRenderer.send('window-quit'),
  onWindowState: (cb) => ipcRenderer.on('window-state', (_, state) => cb(state)),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
});

contextBridge.exposeInMainWorld('backendAPI', {
  status: () => ipcRenderer.invoke('backend:status'),
  start: () => ipcRenderer.invoke('backend:start'),
  syncProviders: (providers) => ipcRenderer.invoke('backend:sync-providers', providers),
  testProvider: (provider) => ipcRenderer.invoke('backend:test-provider', provider),
  getModels: (providers) => ipcRenderer.invoke('backend:get-models', providers),
  sendMessage: (payload) => ipcRenderer.invoke('backend:send-message', payload),
  abort: (chatId) => ipcRenderer.invoke('backend:abort', chatId),
  setWorkspace: (folderPath) => ipcRenderer.invoke('backend:set-workspace', folderPath),
  replyQuestion: (payload) => ipcRenderer.invoke('backend:reply-question', payload),
  rejectQuestion: (payload) => ipcRenderer.invoke('backend:reject-question', payload),
  listQuestions: (sessionId) => ipcRenderer.invoke('backend:list-questions', sessionId),
  resolveQuestionRequestId: (sessionId) => ipcRenderer.invoke('backend:resolve-question-id', sessionId),
  onEvent: (cb) => {
    const listener = (_, event) => cb(event);
    ipcRenderer.on('backend:event', listener);
    return () => ipcRenderer.removeListener('backend:event', listener);
  },
});
