/* ============================================================
   LOGGER - Centralized error logging to main process
   ============================================================ */

'use strict';

const Logger = (() => {
  let contextProvider = null;

  function setContextProvider(fn) {
    contextProvider = typeof fn === 'function' ? fn : null;
  }

  function getContext() {
    try {
      return contextProvider?.() || { process: 'renderer' };
    } catch {
      return { process: 'renderer' };
    }
  }

  function buildMeta(errOrMeta) {
    const details = LogSerialize.buildErrorMeta(errOrMeta) || {};
    return {
      ...details,
      context: getContext(),
    };
  }

  function append(level, source, message, meta) {
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleFn(`[${source}]`, message, meta || '');

    if (window.electronAPI?.logAppend) {
      void window.electronAPI.logAppend({
        level,
        source,
        message,
        meta: LogSerialize.serializeForLog(meta),
      });
    }
  }

  function error(source, message, errOrMeta) {
    append('error', source, message, buildMeta(errOrMeta));
  }

  function warn(source, message, meta) {
    append('warn', source, message, buildMeta(meta));
  }

  function info(source, message, meta) {
    append('info', source, message, meta ? LogSerialize.serializeForLog(meta) : undefined);
  }

  function initGlobalHandlers() {
    window.addEventListener('error', (event) => {
      error('renderer', event.message, {
        error: event.error || {
          name: 'Error',
          message: event.message,
          stack: event.error?.stack,
        },
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      error('renderer', 'Unhandled promise rejection', event.reason);
    });
  }

  initGlobalHandlers();

  return { error, warn, info, setContextProvider };
})();
