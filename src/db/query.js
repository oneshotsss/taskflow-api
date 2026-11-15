const { ValidationError, ConflictError } = require('../errors/AppError');
const logger = require('../utils/logger');

// Client-caused PostgreSQL errors are mapped to domain errors here, in the data
// layer, so services and the HTTP error handler never see SQLSTATE codes.
// Anything else (connection loss, syntax errors, ...) stays a 500.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const FK_MESSAGES = {
  projects_user_id_fkey: 'User referenced by userId does not exist',
  tasks_project_id_fkey: 'Project referenced by projectId does not exist',
};

const translatePgError = (err) => {
  switch (err.code) {
    case '23503': // foreign_key_violation
      return new ValidationError(
        FK_MESSAGES[err.constraint] || 'Referenced entity does not exist',
        { constraint: err.constraint || null }
      );
    case '23505': // unique_violation
      return new ConflictError('Resource already exists');
    default:
      return err;
  }
};

// "INSERT INTO projects" / "SELECT p.id, ..." -> short label for logs.
// Parameters are never logged: they may contain user data.
const describeSql = (sql) => sql.trim().split(/\s+/).slice(0, 3).join(' ');

const runQuery = async (executor, sql, params = []) => {
  const startedAt = process.hrtime.bigint();
  const label = describeSql(sql);
  try {
    const res = await executor.query(sql, params);
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.debug(`[db] ${label} -> ${res?.rowCount ?? 0} rows, ${ms.toFixed(1)}ms`);
    return res;
  } catch (err) {
    logger.warn(`[db] ${label} failed (SQLSTATE ${err.code || 'n/a'}): ${err.message}`);
    throw translatePgError(err);
  }
};

module.exports = { runQuery, translatePgError };
