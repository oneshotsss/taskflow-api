// Repository registry: the only place that decides which implementation
// (PostgreSQL or in-memory prototype) the services talk to.
// Services call getRepositories() at call time, so tests can swap
// implementations with setRepositories() without touching module caches.

const { repoType } = require('../config');

const loadDefaults = () => {
  if (repoType === 'memory') {
    return {
      projectRepo: require('./inMemory/inMemoryProjectRepository'),
      taskRepo: require('./inMemory/inMemoryTaskRepository'),
    };
  }
  return {
    projectRepo: require('./postgres/postgresProjectRepository'),
    taskRepo: require('./postgres/postgresTaskRepository'),
  };
};

let repositories = loadDefaults();

const getRepositories = () => repositories;

const setRepositories = (overrides = {}) => {
  repositories = { ...repositories, ...overrides };
};

const resetRepositories = () => {
  repositories = loadDefaults();
};

module.exports = { getRepositories, setRepositories, resetRepositories };
