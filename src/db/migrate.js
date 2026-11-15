const { getPool } = require('./pool');
const logger = require('../utils/logger');

const migrate = async (customPool) => {
  const pool = customPool || getPool();

  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
      project_id INT REFERENCES projects(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

    -- Idempotency-Key storage for POST /projects (see spec.md, Scenario 1).
    -- response_body is NULL only inside the transaction that claimed the key.
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      scope VARCHAR(50) NOT NULL,
      key VARCHAR(255) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope, key)
    );
  `;

  await pool.query(ddl);
  logger.info('Database schema migration applied successfully');
};

module.exports = { migrate };
