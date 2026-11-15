// Single source of runtime configuration. Every module that needs to know
// the repository mode, port or DB URL reads it from here — nowhere else.

const VALID_REPO_TYPES = ['postgres', 'memory'];

const loadConfig = (env = process.env) => {
  const repoType = env.REPO_TYPE || 'postgres';
  if (!VALID_REPO_TYPES.includes(repoType)) {
    throw new Error(
      `Invalid REPO_TYPE "${repoType}". Allowed values: ${VALID_REPO_TYPES.join(', ')}`
    );
  }

  const pgPort = env.POSTGRES_PORT || '5432';

  return {
    port: Number(env.PORT) || 3000,
    repoType,
    databaseUrl:
      env.DATABASE_URL ||
      `postgres://taskflow_user:taskflow_password@localhost:${pgPort}/taskflow_db`,
  };
};

module.exports = { ...loadConfig(), loadConfig, VALID_REPO_TYPES };
