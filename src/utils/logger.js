const { getProcessId, getUserId } = require('../context/asyncContext');

// Every line carries the processId of the current request (from AsyncLocalStorage),
// so one grep by processId shows the request, the service calls, the SQL and the response.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// Read on every call so tests and `LOG_LEVEL=... npm start` take effect without reloads.
const currentThreshold = () => {
  const fallback = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  return LEVELS[process.env.LOG_LEVEL] ?? LEVELS[fallback];
};

const formatPrefix = (level) => {
  const userId = getUserId();
  const userPart = userId ? ` [User: ${userId}]` : '';
  return `[${new Date().toISOString()}] [Process: ${getProcessId()}]${userPart} ${level.toUpperCase()}:`;
};

const formatMeta = (meta) => {
  if (meta === undefined || meta === '') return '';
  if (meta instanceof Error) return meta.stack;
  return typeof meta === 'string' ? meta : JSON.stringify(meta);
};

// `stream` is looked up on each call (not captured once) so console can be spied on in tests.
const write = (level, stream) => (message, meta) => {
  if (LEVELS[level] < currentThreshold()) return;
  const extra = formatMeta(meta);
  console[stream](`${formatPrefix(level)} ${message}${extra ? ` ${extra}` : ''}`);
};

const logger = {
  debug: write('debug', 'log'),
  info: write('info', 'log'),
  warn: write('warn', 'warn'),
  error: write('error', 'error'),
};

module.exports = logger;
