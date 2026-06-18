const { app, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const UPDATE_CONFIG = {
  owner: 'ImTheLeviDR',
  repo: 'code-app',
};

const state = {
  checking: false,
  upToDate: null,
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseName: null,
  releaseNotes: null,
  releasePageUrl: null,
  asset: null,
  error: null,
  downloading: false,
  downloadPath: null,
  notificationShown: false,
};

function parseVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => parseInt(part, 10) || 0);
}

function isNewerVersion(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }

  return false;
}

function pickReleaseAsset(release) {
  const assets = release?.assets || [];
  if (!assets.length) return null;

  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    const winAssets = assets.filter((asset) => /\.exe$/i.test(asset.name));
    return (
      winAssets.find((asset) => /setup|install/i.test(asset.name) && new RegExp(arch, 'i').test(asset.name))
      || winAssets.find((asset) => /setup|install/i.test(asset.name))
      || winAssets.find((asset) => new RegExp(arch, 'i').test(asset.name))
      || winAssets[0]
    );
  }

  if (platform === 'darwin') {
    const macAssets = assets.filter((asset) => /\.(dmg|zip|pkg)$/i.test(asset.name));
    return (
      macAssets.find((asset) => /\.dmg$/i.test(asset.name))
      || macAssets.find((asset) => /mac|darwin|osx|universal|arm64|x64/i.test(asset.name))
      || macAssets[0]
    );
  }

  const linuxAssets = assets.filter((asset) => /\.(AppImage|deb|rpm)$/i.test(asset.name));
  return (
    linuxAssets.find((asset) => new RegExp(arch, 'i').test(asset.name))
    || linuxAssets[0]
  );
}

async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases/latest`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'code-app-updater',
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`);
  }

  return response.json();
}

function getPublicStatus() {
  return {
    checking: state.checking,
    upToDate: state.upToDate,
    currentVersion: state.currentVersion,
    latestVersion: state.latestVersion,
    releaseName: state.releaseName,
    releaseNotes: state.releaseNotes,
    releasePageUrl: state.releasePageUrl,
    error: state.error,
    downloading: state.downloading,
    assetName: state.asset?.name || null,
  };
}

function notifyRenderer(getMainWindow) {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('updates:status', getPublicStatus());
}

async function downloadReleaseAsset(asset) {
  const response = await fetch(asset.url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'code-app-updater',
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const tempDir = path.join(app.getPath('temp'), 'code-app-updates');
  fs.mkdirSync(tempDir, { recursive: true });
  const destPath = path.join(tempDir, asset.name);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

function runInstaller(installerPath) {
  if (!app.isPackaged) {
    throw new Error('Updates can only be installed in the packaged app');
  }

  if (process.platform === 'win32') {
    spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    shell.openPath(installerPath);
    return;
  }

  try {
    fs.chmodSync(installerPath, 0o755);
  } catch {
    /* ignore */
  }
  spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
}

function showSystemUpdateNotification(onInstall) {
  if (!Notification.isSupported() || state.notificationShown) return;

  const notification = new Notification({
    title: 'Update available',
    body: `Code app ${state.latestVersion} is ready to install.`,
    actions: [{ type: 'button', text: 'Install' }],
    closeButtonText: 'Later',
  });

  notification.on('action', () => {
    onInstall();
  });

  notification.on('click', () => {
    onInstall();
  });

  notification.show();
  state.notificationShown = true;
}

async function checkForUpdates(getMainWindow, { notify = true } = {}) {
  if (state.checking) return getPublicStatus();

  state.checking = true;
  state.error = null;
  notifyRenderer(getMainWindow);

  try {
    const release = await fetchLatestRelease();
    state.currentVersion = app.getVersion();

    if (!release) {
      state.upToDate = true;
      state.latestVersion = state.currentVersion;
      state.asset = null;
    } else {
      const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
      const asset = pickReleaseAsset(release);

      state.latestVersion = latestVersion || state.currentVersion;
      state.releaseName = release.name || latestVersion;
      state.releaseNotes = release.body || '';
      state.releasePageUrl = release.html_url || '';
      state.asset = asset
        ? { name: asset.name, url: asset.url, size: asset.size }
        : null;
      state.upToDate = !isNewerVersion(state.latestVersion, state.currentVersion) || !state.asset;
    }
  } catch (err) {
    state.error = err.message || 'Update check failed';
    state.upToDate = null;
  } finally {
    state.checking = false;
  }

  notifyRenderer(getMainWindow);

  if (notify && state.upToDate === false && app.isPackaged) {
    const win = getMainWindow?.();
    const windowHidden = !win || win.isDestroyed() || !win.isVisible();
    if (windowHidden) {
      showSystemUpdateNotification(() => {
        void downloadAndInstall(getMainWindow, { quitApp: true });
      });
    }
  }

  return getPublicStatus();
}

async function downloadAndInstall(getMainWindow, { quitApp = true } = {}) {
  if (state.downloading) {
    throw new Error('Update already downloading');
  }

  if (!state.asset?.url) {
    await checkForUpdates(getMainWindow, { notify: false });
  }

  if (state.upToDate) {
    throw new Error('Already up to date');
  }

  if (!state.asset?.url) {
    throw new Error('No installer found in the latest GitHub release');
  }

  state.downloading = true;
  state.error = null;
  notifyRenderer(getMainWindow);

  try {
    const installerPath = await downloadReleaseAsset(state.asset);
    state.downloadPath = installerPath;
    runInstaller(installerPath);

    if (quitApp) {
      app.quit();
    }

    return { ok: true, path: installerPath };
  } catch (err) {
    state.error = err.message || 'Update install failed';
    notifyRenderer(getMainWindow);
    throw err;
  } finally {
    state.downloading = false;
    notifyRenderer(getMainWindow);
  }
}

function registerUpdateHandlers(ipcMain, { getMainWindow }) {
  ipcMain.handle('updates:get-status', () => getPublicStatus());

  ipcMain.handle('updates:check', () => checkForUpdates(getMainWindow, { notify: false }));

  ipcMain.handle('updates:install', () => downloadAndInstall(getMainWindow, { quitApp: true }));

  app.whenReady().then(() => {
    setTimeout(() => {
      void checkForUpdates(getMainWindow, { notify: true });
    }, 2500);
  });
}

module.exports = {
  registerUpdateHandlers,
  checkForUpdates,
  downloadAndInstall,
  getPublicStatus,
};
