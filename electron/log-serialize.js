const REDACT_KEY = /^(apiKey|api_key|authorization|password|token|secret|bearer|cookie)$/i;
const MAX_STRING = 20000;
const MAX_DEPTH = 8;
const MAX_ARRAY = 50;
const MAX_KEYS = 60;

function truncateString(value) {
  if (value.length <= MAX_STRING) return value;
  return `${value.slice(0, MAX_STRING)}…[truncated ${value.length - MAX_STRING} chars]`;
}

function isErrorLike(value) {
  return value instanceof Error
    || (value && typeof value === 'object' && typeof value.message === 'string' && typeof value.stack === 'string');
}

function serializeErrorDetail(err, depth = 0, seen = new WeakSet()) {
  if (!err || depth > MAX_DEPTH) return err ? '[MaxDepth]' : undefined;
  if (seen.has(err)) return '[Circular]';
  seen.add(err);

  const detail = {
    name: err.name || 'Error',
    message: truncateString(String(err.message || '')),
    stack: err.stack ? truncateString(String(err.stack)) : undefined,
    code: err.code,
  };

  if (err.errno != null) detail.errno = err.errno;
  if (err.syscall) detail.syscall = err.syscall;
  if (err.path) detail.path = err.path;
  if (err.statusCode != null) detail.statusCode = err.statusCode;
  if (err.status != null) detail.status = err.status;
  if (err.type) detail.type = err.type;
  if (err.reason) detail.reason = serializeForLog(err.reason, depth + 1, seen);
  if (err.cause) detail.cause = serializeForLog(err.cause, depth + 1, seen);
  if (err.response != null) detail.response = serializeForLog(err.response, depth + 1, seen);
  if (err.data != null) detail.data = serializeForLog(err.data, depth + 1, seen);

  for (const key of Object.keys(err)) {
    if (key in detail || REDACT_KEY.test(key)) continue;
    try {
      detail[key] = serializeForLog(err[key], depth + 1, seen);
    } catch {
      detail[key] = '[Unserializable]';
    }
  }

  return detail;
}

function serializeForLog(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return '[MaxDepth]';

  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (isErrorLike(value)) return serializeErrorDetail(value, depth, seen);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();

  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => serializeForLog(item, depth + 1, seen));
    if (value.length > MAX_ARRAY) items.push(`…[${value.length - MAX_ARRAY} more items]`);
    return items;
  }

  const out = {};
  let count = 0;
  for (const key of Object.keys(value)) {
    if (count >= MAX_KEYS) {
      out['…'] = `[Truncated after ${MAX_KEYS} keys]`;
      break;
    }
    if (REDACT_KEY.test(key)) {
      out[key] = '[REDACTED]';
      count += 1;
      continue;
    }
    try {
      out[key] = serializeForLog(value[key], depth + 1, seen);
    } catch {
      out[key] = '[Unserializable]';
    }
    count += 1;
  }
  return out;
}

function buildErrorMeta(errOrMeta) {
  if (errOrMeta == null) return undefined;
  if (errOrMeta instanceof Error || isErrorLike(errOrMeta)) {
    return { error: serializeErrorDetail(errOrMeta) };
  }
  if (typeof errOrMeta === 'object') return serializeForLog(errOrMeta);
  return { detail: String(errOrMeta) };
}

module.exports = {
  serializeForLog,
  serializeErrorDetail,
  buildErrorMeta,
};
