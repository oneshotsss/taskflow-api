const { AsyncLocalStorage } = require('node:async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

const runWithContext = (contextData, fn) => {
  return asyncLocalStorage.run(contextData, fn);
};

const getContext = () => {
  return asyncLocalStorage.getStore() || {};
};

const getProcessId = () => {
  const store = asyncLocalStorage.getStore();
  return store && store.processId ? store.processId : 'system-process';
};

const getUserId = () => {
  const store = asyncLocalStorage.getStore();
  return store && store.userId ? store.userId : null;
};

module.exports = {
  asyncLocalStorage,
  runWithContext,
  getContext,
  getProcessId,
  getUserId,
};
