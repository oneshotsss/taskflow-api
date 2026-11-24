const { getPool } = require('../../db/pool');
const { runQuery } = require('../../db/query');

class PostgresTaskRepository {
  async create({ title, projectId, status = 'TODO' }, client) {
    const executor = client || getPool();
    const query = `
      INSERT INTO tasks (title, status, project_id)
      VALUES ($1, $2, $3)
      RETURNING id, title, status, project_id AS "projectId", created_at AS "createdAt";
    `;
    const res = await runQuery(executor, query, [title, status, projectId || null]);
    return res.rows[0];
  }

  async findById(id, client) {
    const executor = client || getPool();
    const query = `
      SELECT id, title, status, project_id AS "projectId", created_at AS "createdAt"
      FROM tasks
      WHERE id = $1;
    `;
    const res = await runQuery(executor, query, [id]);
    return res.rows[0] || null;
  }

  async findAll(client) {
    const executor = client || getPool();
    const query = `
      SELECT id, title, status, project_id AS "projectId", created_at AS "createdAt"
      FROM tasks
      ORDER BY id ASC;
    `;
    const res = await runQuery(executor, query);
    return res.rows;
  }

  async updateStatus(id, newStatus, client) {
    const executor = client || getPool();
    const query = `
      UPDATE tasks
      SET status = $1
      WHERE id = $2
      RETURNING id, title, status, project_id AS "projectId", created_at AS "createdAt";
    `;
    const res = await runQuery(executor, query, [newStatus, id]);
    return res.rows[0] || null;
  }
}

module.exports = new PostgresTaskRepository();
