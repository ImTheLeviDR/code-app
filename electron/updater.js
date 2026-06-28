const { app, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { logError } = require('./log-service');

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
  isPrerelease: false,
  asset: null,
  error: null,
  downloading: false,
  installPhase: null,
  downloadProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
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

function getReleaseVersion(release) {
  const raw = String(release?.tag_name || release?.name || '').trim().replace(/^v/i, '');
  const match = raw.match(/^(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function findLatestRelease(releases) {
  if (!Array.isArray(releases) || !releases.length) return null;

  let bestRelease = null;
  let bestVersion = null;

  for (const release of releases) {
    const version = getReleaseVersion(release);
    if (!version) continue;
    if (!pickReleaseAsset(release)) continue;
    if (!bestVersion || isNewerVersion(version, bestVersion)) {
      bestRelease = release;
      bestVersion = version;
    }
  }

  return bestRelease;
}

async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases?per_page=20`;
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

  const releases = await response.json();
  return findLatestRelease(releases);
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
    isPrerelease: state.isPrerelease,
    error: state.error,
    downloading: state.downloading,
    installPhase: state.installPhase,
    downloadProgress: state.downloadProgress,
    downloadedBytes: state.downloadedBytes,
    totalBytes: state.totalBytes,
    assetName: state.asset?.name || null,
  };
}

function notifyRenderer(getMainWindow) {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('updates:status', getPublicStatus());
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function downloadReleaseAsset(asset, onProgress) {
  const response = await fetch(asset.url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'code-app-updater',
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const total = Number(response.headers.get('content-length')) || asset.size || 0;
  const tempDir = path.join(app.getPath('temp'), 'code-app-updates');
  fs.mkdirSync(tempDir, { recursive: true });
  const destPath = path.join(tempDir, asset.name);

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    onProgress?.({ downloaded: buffer.length, total: buffer.length, percent: 100 });
    return destPath;
  }

  const reader = response.body.getReader();
  const handle = fs.openSync(destPath, 'w');
  let downloaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fs.writeSync(handle, value);
      downloaded += value.length;
      const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
      onProgress?.({ downloaded, total, percent });
    }
  } finally {
    fs.closeSync(handle);
  }

  onProgress?.({ downloaded, total: total || downloaded, percent: 100 });
  return destPath;
}

function runInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const child = spawn(installerPath, [], { detached: true, stdio: 'ignore', shell: true });
      child.on('error', reject);
      child.unref();
      resolve();
      return;
    }

    if (process.platform === 'darwin') {
      shell.openPath(installerPath).then((result) => {
        if (result) reject(new Error(result));
        else resolve();
      });
      return;
    }

    try {
      fs.chmodSync(installerPath, 0o755);
    } catch {
      /* ignore */
    }
    const child = spawn(installerPath, [], { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}

function cleanupInstaller(installerPath) {
  try {
    fs.unlinkSync(installerPath);
  } catch {
    /* ignore */
  }
  try {
    const tempDir = path.dirname(installerPath);
    fs.rmdirSync(tempDir);
  } catch {
    /* ignore */
  }
}

function cleanupStaleInstallers() {
  try {
    const tempDir = path.join(app.getPath('temp'), 'code-app-updates');
    if (!fs.existsSync(tempDir)) return;
    for (const file of fs.readdirSync(tempDir)) {
      const filePath = path.join(tempDir, file);
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmdirSync(tempDir);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

function saveRendererState(getMainWindow) {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    win.webContents.executeJavaScript('window.saveChatState?.()', true);
  } catch {
    /* ignore */
  }
}

function showSystemUpdateNotification(getMainWindow, onInstall) {
  if (!Notification.isSupported() || state.notificationShown) return;

  const notification = new Notification({
    title: 'Update available',
    body: `Code app ${state.latestVersion} is ready to install.`,
    actions: [{ type: 'button', text: 'Install' }],
    closeButtonText: 'Later',
  });

  const beginInstall = () => {
    onInstall();
  };

  notification.on('action', beginInstall);
  notification.on('click', beginInstall);
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
      state.isPrerelease = false;
      state.asset = null;
    } else {
      const latestVersion = getReleaseVersion(release) || state.currentVersion;
      const asset = pickReleaseAsset(release);

      state.latestVersion = latestVersion;
      state.releaseName = release.name || latestVersion;
      state.releaseNotes = release.body || '';
      state.releasePageUrl = release.html_url || '';
      state.isPrerelease = Boolean(release.prerelease);
      state.asset = asset
        ? { name: asset.name, url: asset.url, size: asset.size }
        : null;
      state.upToDate = !isNewerVersion(state.latestVersion, state.currentVersion) || !state.asset;
    }
  } catch (err) {
    state.error = err.message || 'Update check failed';
    state.upToDate = null;
    logError('updater', 'Update check failed', err);
  } finally {
    state.checking = false;
  }

  notifyRenderer(getMainWindow);

  if (notify && state.upToDate === false && app.isPackaged) {
    const win = getMainWindow?.();
    const windowHidden = !win || win.isDestroyed() || !win.isVisible();
    if (windowHidden) {
      showSystemUpdateNotification(getMainWindow, () => {
        beginInstallFlow(getMainWindow);
      });
    }
  }

  return getPublicStatus();
}

function beginInstallFlow(getMainWindow, helpers = {}) {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) return;

  state.downloading = false;
  state.error = null;
  state.installPhase = 'preparing';
  state.downloadProgress = 0;
  state.downloadedBytes = 0;

  helpers.showMainWindow?.();
  notifyRenderer(getMainWindow);
  win.webContents.send('updates:begin-install');

  void downloadAndInstall(getMainWindow, helpers).catch((err) => {
    state.error = err?.message || 'Update install failed';
    state.installPhase = 'error';
    state.downloading = false;
    notifyRenderer(getMainWindow);
    logError('updater', 'Background update install failed', err);
  });
}

async function downloadAndInstall(getMainWindow, helpers = {}) {
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
  state.installPhase = 'downloading';
  state.downloadProgress = 0;
  state.downloadedBytes = 0;
  state.totalBytes = state.asset.size || 0;
  state.error = null;
  notifyRenderer(getMainWindow);

  try {
    const installerPath = await downloadReleaseAsset(state.asset, (progress) => {
      state.downloadedBytes = progress.downloaded;
      state.totalBytes = progress.total || state.asset.size || progress.downloaded;
      state.downloadProgress = progress.percent ?? state.downloadProgress;
      notifyRenderer(getMainWindow);
    });

    state.downloadPath = installerPath;
    state.installPhase = 'launching';
    state.downloadProgress = 100;
    notifyRenderer(getMainWindow);

    saveRendererState(getMainWindow);
    helpers.prepareForQuit?.();
    helpers.destroyTray?.();
    await runInstaller(installerPath);

    state.installPhase = 'done';
    notifyRenderer(getMainWindow);

    await new Promise((r) => setTimeout(r, 3000));
    cleanupInstaller(installerPath);
    app.exit(0);

    return { ok: true, path: installerPath };
  } catch (err) {
    state.error = err.message || 'Update install failed';
    state.installPhase = 'error';
    notifyRenderer(getMainWindow);
    logError('updater', 'Update install failed', err);
    throw err;
  } finally {
    state.downloading = false;
  }
}

function registerUpdateHandlers(ipcMain, helpers) {
  const { getMainWindow, showMainWindow, prepareForQuit, destroyTray } = helpers;
  const installHelpers = { showMainWindow, prepareForQuit, destroyTray };

  ipcMain.handle('updates:get-status', () => getPublicStatus());

  ipcMain.handle('updates:check', () => checkForUpdates(getMainWindow, { notify: false }));

  ipcMain.handle('updates:install', async () => {
    beginInstallFlow(getMainWindow, installHelpers);
    return getPublicStatus();
  });

  app.whenReady().then(() => {
    cleanupStaleInstallers();
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
  formatBytes,
};
