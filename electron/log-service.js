const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const { serializeForLog, buildErrorMeta } = require('./log-serialize');

const MAX_BUFFER = 500;
const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

const buffer = [];
let logDir = null;
let currentLogDate = null;
let currentLogPath = null;

function getLogsDirectory() {
  if (!logDir) {
    logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function getDailyLogPath() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentLogDate) {
    currentLogDate = today;
    currentLogPath = path.join(getLogsDirectory(), `app-${today}.log`);
  }
  return currentLogPath;
}

function getMainContext() {
  return {
    process: 'main',
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    appVersion: typeof app.getVersion === 'function' ? app.getVersion() : undefined,
  };
}

function sanitizeMeta(meta) {
  if (meta == null) return undefined;
  return serializeForLog(meta);
}

function createEntry(level, source, message, meta) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level: VALID_LEVELS.has(level) ? level : 'info',
    source: String(source || 'app').slice(0, 100),
    message: String(message || ''),
    meta: sanitizeMeta(meta),
  };

  if (level === 'error' && entry.message.length > 20000) {
    entry.message = `${entry.message.slice(0, 20000)}…[truncated]`;
  }

  return entry;
}

function appendToFile(entry) {
  try {
    fs.appendFileSync(getDailyLogPath(), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    console.error('Failed to write log entry:', err);
  }
}

function pushToBuffer(entry) {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

function log(level, source, message, meta) {
  const entry = createEntry(level, source, message, meta);
  pushToBuffer(entry);
  appendToFile(entry);
  if (level === 'error') {
    console.error(`[${entry.source}]`, entry.message, entry.meta || '');
  } else if (level === 'warn') {
    console.warn(`[${entry.source}]`, entry.message, entry.meta || '');
  }
  return entry;
}

function logError(source, message, errOrMeta) {
  const details = buildErrorMeta(errOrMeta) || {};
  return log('error', source, message, {
    ...details,
    context: getMainContext(),
  });
}

function getRecentLogs({ limit = 200, level } = {}) {
  let entries = [...buffer];
  if (level && VALID_LEVELS.has(level)) {
    entries = entries.filter((entry) => entry.level === level);
  }
  return entries.slice(-limit).reverse();
}

function loadLogsFromFile(limit = 200) {
  try {
    const filePath = getDailyLogPath();
    if (!fs.existsSync(filePath)) return getRecentLogs({ limit });

    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    const fromFile = lines
      .slice(-limit * 2)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const byId = new Map();
    for (const entry of fromFile) byId.set(entry.id, entry);
    for (const entry of buffer) byId.set(entry.id, entry);

    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  } catch (err) {
    logError('log-service', 'Failed to load logs from file', err);
    return getRecentLogs({ limit });
  }
}

function clearLogs() {
  buffer.length = 0;
  try {
    const dir = getLogsDirectory();
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.log')) fs.unlinkSync(path.join(dir, file));
    }
    currentLogDate = null;
    currentLogPath = null;
    return true;
  } catch (err) {
    logError('log-service', 'Failed to clear logs', err);
    return false;
  }
}

function formatMetaBlock(meta, indent = '') {
  if (!meta || typeof meta !== 'object') return `${indent}${String(meta ?? '')}`;
  return JSON.stringify(meta, null, 2)
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function formatLogsAsText(entries) {
  return entries.map((entry) => {
    const lines = [
      `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.source}`,
      `Message: ${entry.message}`,
    ];

    if (entry.meta) {
      lines.push('Details:');
      lines.push(formatMetaBlock(entry.meta, '  '));
    }

    return lines.join('\n');
  }).join('\n\n---\n\n');
}

function registerLogHandlers(ipcMain) {
  ipcMain.handle('logs:append', (_evt, payload) => {
    if (!payload || typeof payload !== 'object') return { ok: false };
    const meta = payload.meta ? serializeForLog(payload.meta) : undefined;
    log(payload.level || 'info', payload.source, payload.message, meta);
    return { ok: true };
  });

  ipcMain.handle('logs:get-recent', (_evt, options = {}) => {
    const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
    let entries = loadLogsFromFile(limit * 2);
    if (options.level && VALID_LEVELS.has(options.level)) {
      entries = entries.filter((entry) => entry.level === options.level);
    }
    return entries.slice(0, limit);
  });

  ipcMain.handle('logs:get-dir', () => getLogsDirectory());

  ipcMain.handle('logs:clear', () => clearLogs());

  ipcMain.handle('logs:open-folder', async () => {
    const dir = getLogsDirectory();
    await shell.openPath(dir);
    return dir;
  });

  ipcMain.handle('logs:export-text', (_evt, options = {}) => {
    const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 1000);
    return formatLogsAsText(loadLogsFromFile(limit));
  });
}

function installProcessErrorHandlers() {
  process.on('uncaughtException', (err) => {
    logError('main', 'Uncaught exception', err);
  });

  process.on('unhandledRejection', (reason) => {
    logError('main', 'Unhandled promise rejection', reason);
  });
}

module.exports = {
  log,
  logError,
  logWarn: (source, message, meta) => log('warn', source, message, meta ? { ...buildErrorMeta(meta), context: getMainContext() } : undefined),
  logInfo: (source, message, meta) => log('info', source, message, meta),
  getRecentLogs,
  loadLogsFromFile,
  clearLogs,
  getLogsDirectory,
  formatLogsAsText,
  registerLogHandlers,
  installProcessErrorHandlers,
};
