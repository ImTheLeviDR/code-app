const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');
const { registerBackendHandlers, shutdownBackend, ensureStarted } = require('./backend-bridge');
const { registerChatPersistenceHandlers } = require('./chat-persistence');
const { registerUpdateHandlers } = require('./updater');

let mainWindow;
let tray = null;
let trayMenu = null;
let isQuitting = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId(process.execPath);
}

// Notification area icon (32x32, shown under "Show hidden icons")
const TRAY_ICON_PATH = path.join(__dirname, 'tray-icon.png');

function createTrayIcon() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  if (icon.isEmpty()) {
    return nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVQ4y2NgGAWjYBSMglEwCkbBKEhPT1f7' +
      'DwAAGA8B/XH3+1QAAAAASUVORK5CYII='
    );
  }
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  return icon;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  if (process.platform === 'win32') mainWindow.setSkipTaskbar(false);
  if (!mainWindow.isVisible()) mainWindow.show();

  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
    return;
  }

  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Code app');

  trayMenu = Menu.buildFromTemplate([
    { label: 'Show Code app', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  // Left-click the notification icon (including "Show hidden icons").
  // Do not use setContextMenu() on Windows - it can swallow left-click.
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  tray.on('right-click', () => {
    tray.popUpContextMenu(trayMenu);
  });
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.hide();
  if (process.platform === 'win32') {
    mainWindow.setSkipTaskbar(true);
  }
}

function getOsLabel() {
  if (process.platform === 'win32') {
    const version = process.getSystemVersion?.() || os.release();
    const [major, , build] = version.split('.').map((part) => parseInt(part, 10) || 0);
    const isWindows11 = major >= 11 || (major === 10 && build >= 22000);
    return isWindows11 ? 'Windows 11' : 'Windows 10';
  }

  if (process.platform === 'darwin') {
    const version = process.getSystemVersion?.() || os.release();
    const major = version.split('.')[0];
    return major ? `macOS ${major}` : 'macOS';
  }

  if (process.platform === 'linux') {
    return 'Linux';
  }

  return os.type();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  let windowReadyToShow = false;

  mainWindow.once('ready-to-show', () => {
    windowReadyToShow = true;
    if (mainWindow._shellReady) mainWindow.show();
  });

  mainWindow._shellReady = false;
  mainWindow._windowReadyToShow = () => windowReadyToShow;

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state', 'maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state', 'normal');
  });
}

function getWorkspacePath() {
  return path.join(app.getPath('userData'), 'workspace');
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  createWindow();
  createTray();
  registerChatPersistenceHandlers(ipcMain);

  registerBackendHandlers({
    getMainWindow: () => mainWindow,
    getWorkspace: getWorkspacePath,
  });

  registerUpdateHandlers(ipcMain, {
    getMainWindow: () => mainWindow,
  });

  try {
    await ensureStarted(() => mainWindow, getWorkspacePath());
  } catch (err) {
    console.error('OpenCode backend:', err.message);
  }
});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('window-all-closed', () => {
  // Keep running in the notification area.
});

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.executeJavaScript('window.saveChatState?.()', true);
    } catch {
      /* ignore */
    }
  }
  shutdownBackend();
});

app.on('activate', () => {
  showMainWindow();
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('app-shell-ready', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow._shellReady = true;
  if (mainWindow._windowReadyToShow?.()) mainWindow.show();
});
ipcMain.on('app-ready', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => hideMainWindow());
ipcMain.on('window-quit', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osLabel: getOsLabel(),
  opencodeVersion: pkg.dependencies?.['opencode-ai']?.replace(/^\^/, '') || null,
}));

ipcMain.handle('app:open-external', async (_evt, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('dialog:open-folder', async () => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

const IMAGE_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const IMAGE_DESCRIPTION_MODEL = 'google/gemini-3.1-flash-lite-preview';

function filePathToDataUrl(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = IMAGE_MIME_TYPES[ext] || 'application/octet-stream';
  const data = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    dataUrl: `data:${mime};base64,${data.toString('base64')}`,
  };
}

ipcMain.handle('dialog:open-images', async () => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    title: 'Attach images',
    filters: [{ name: 'Images', extensions: Object.keys(IMAGE_MIME_TYPES) }],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths.map(filePathToDataUrl);
});

ipcMain.handle('openrouter:describe-images', async (_evt, { apiKey, images }) => {
  if (!apiKey?.trim()) throw new Error('OpenRouter API key is required');
  if (!Array.isArray(images) || !images.length) return [];

  const results = [];
  for (const image of images) {
    if (!image?.dataUrl) continue;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: IMAGE_DESCRIPTION_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this image in detail for a coding assistant. Include any visible text, code, UI elements, diagrams, error messages, and overall context.',
            },
            {
              type: 'image_url',
              image_url: { url: image.dataUrl },
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter request failed (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const description = data?.choices?.[0]?.message?.content?.trim() || 'Unable to describe image.';
    results.push({ id: image.id, description });
  }

  return results;
});
