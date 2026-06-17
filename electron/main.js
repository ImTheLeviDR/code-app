const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { registerBackendHandlers, shutdownBackend, ensureStarted } = require('./backend-bridge');
const { registerChatPersistenceHandlers } = require('./chat-persistence');

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

ipcMain.handle('dialog:open-folder', async () => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});
