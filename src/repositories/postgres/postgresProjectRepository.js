const { getPool, withTransaction } = require('../../db/pool');
const { runQuery } = require('../../db/query');
const { resolveStoredKey } = require('../idempotency');

// Inside json_agg the pg driver does not parse timestamps, PostgreSQL renders
// them itself ("2026-11-24 09:14:36.325403+00"). Format them exactly like
// Date#toISOString() so a task looks the same in POST and GET responses.
const ISO_TIMESTAMP = (column) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

class PostgresProjectRepository {
  async create({ name, userId }, client) {
    const executor = client || getPool();
    const query = `
      INSERT INTO projects (name, user_id)
      VALUES ($1, $2)
      RETURNING id, name, user_id AS "userId", created_at AS "createdAt";
    `;
    const res = await runQuery(executor, query, [name, userId || null]);
    return res.rows[0];
  }

  // Optimized single-query project listing with tasks (ELIMINATES N+1)
  async findAllWithTasks(client) {
    const executor = client || getPool();
    const query = `
      SELECT 
        p.id,
        p.name,
        p.user_id AS "userId",
        p.created_at AS "createdAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', t.id,
              'title', t.title,
              'status', t.status,
              'projectId', t.project_id,
              'createdAt', ${ISO_TIMESTAMP('t.created_at')}
            )
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      GROUP BY p.id
      ORDER BY p.id ASC;
    `;
    const res = await runQuery(executor, query);
    return res.rows;
  }

  // Optimized single-query project details with tasks (ELIMINATES N+1)
  async findByIdWithTasks(id, client) {
    const executor = client || getPool();
    const query = `
      SELECT 
        p.id,
        p.name,
        p.user_id AS "userId",
        p.created_at AS "createdAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', t.id,
              'title', t.title,
              'status', t.status,
              'projectId', t.project_id,
              'createdAt', ${ISO_TIMESTAMP('t.created_at')}
            )
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.id = $1
      GROUP BY p.id;
    `;
    const res = await runQuery(executor, query, [id]);
    return res.rows[0] || null;
  }

  // Scenario 4: tasks and project are removed in ONE transaction on ONE client.
  // Returns null when the project does not exist (nothing is deleted then).
  async deleteWithTasks(id) {
    return await withTransaction(async (client) => {
      const tasksRes = await runQuery(client, 'DELETE FROM tasks WHERE project_id = $1;', [id]);
      const projectRes = await runQuery(
        client,
        'DELETE FROM projects WHERE id = $1 RETURNING id;',
        [id]
      );
      if (projectRes.rowCount === 0) return null;
      return { deletedTasks: tasksRes.rowCount };
    });
  }

  // Scenario 1. When `idempotency` ({ scope, key, requestHash }) is given, the key
  // is claimed in the SAME transaction that creates the project:
  //  - first request: INSERT claims the key, project+tasks are created, the
  //    response is stored, COMMIT makes all of it visible at once;
  //  - concurrent duplicate: its INSERT ... ON CONFLICT waits on the row lock
  //    until the first transaction ends, then reads the stored response;
  //  - if the first transaction rolls back, the key is released with it.
  async createWithTasks({ name, userId, initialTasks }, { idempotency } = {}) {
    return await withTransaction(async (client) => {
      if (idempotency) {
        const { scope, key, requestHash } = idempotency;
        const claimed = await runQuery(
          client,
          `INSERT INTO idempotency_keys (scope, key, request_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (scope, key) DO NOTHING
           RETURNING key;`,
          [scope, key, requestHash]
        );
        if (claimed.rowCount === 0) {
          const stored = await runQuery(
            client,
            `SELECT request_hash AS "requestHash", response_body AS "responseBody"
             FROM idempotency_keys WHERE scope = $1 AND key = $2;`,
            [scope, key]
          );
          return resolveStoredKey(stored.rows[0], requestHash);
        }
      }

      const created = await this.create({ name, userId }, client);
      const tasks = [];
      for (const t of initialTasks) {
        const taskQuery = `
          INSERT INTO tasks (title, status, project_id)
          VALUES ($1, 'TODO', $2)
          RETURNING id, title, status, project_id AS "projectId", created_at AS "createdAt";
        `;
        const taskRes = await runQuery(client, taskQuery, [t.title, created.id]);
        tasks.push(taskRes.rows[0]);
      }
      // JSON round-trip so a fresh response and a replayed one are byte-identical.
      const project = JSON.parse(JSON.stringify({ ...created, tasks }));

      if (idempotency) {
        await runQuery(
          client,
          `UPDATE idempotency_keys SET response_body = $3 WHERE scope = $1 AND key = $2;`,
          [idempotency.scope, idempotency.key, project]
        );
      }

      return { project, replayed: false };
    });
  }
}

module.exports = new PostgresProjectRepository();
