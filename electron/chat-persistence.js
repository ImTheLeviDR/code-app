const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getChatStatePath() {
  return path.join(app.getPath('userData'), 'chat-state.json');
}

function loadChatState() {
  const filePath = getChatStatePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read chat state file:', err);
    return null;
  }
}

function saveChatState(data) {
  const filePath = getChatStatePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const json = JSON.stringify(data);
  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function deleteChatState() {
  const filePath = getChatStatePath();
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error('Failed to delete chat state file:', err);
    return false;
  }
}

function registerChatPersistenceHandlers(ipcMain) {
  ipcMain.on('chats:save-sync', (event, data) => {
    try {
      saveChatState(data);
      event.returnValue = true;
    } catch (err) {
      console.error('Failed to save chat state file:', err);
      event.returnValue = false;
    }
  });

  ipcMain.on('chats:load-sync', (event) => {
    try {
      event.returnValue = loadChatState();
    } catch (err) {
      console.error('Failed to load chat state file:', err);
      event.returnValue = null;
    }
  });
  ipcMain.on('chats:delete-sync', (event) => {
    try {
      event.returnValue = deleteChatState();
    } catch (err) {
      console.error('Failed to delete chat state file:', err);
      event.returnValue = false;
    }
  });
}

module.exports = {
  loadChatState,
  saveChatState,
  deleteChatState,
  registerChatPersistenceHandlers,
};
