const { getPool } = require('../../db/pool');

class PostgresTaskRepository {
  async create({ title, projectId, status = 'TODO' }, client) {
    const executor = client || getPool();
    const query = `
      INSERT INTO tasks (title, status, project_id)
      VALUES ($1, $2, $3)
      RETURNING id, title, status, project_id AS "projectId", created_at AS "createdAt";
    `;
    const res = await executor.query(query, [title, status, projectId || null]);
    return res.rows[0];
  }

  async findById(id, client) {
    const executor = client || getPool();
    const query = `
      SELECT id, title, status, project_id AS "projectId", created_at AS "createdAt"
      FROM tasks
      WHERE id = $1;
    `;
    const res = await executor.query(query, [id]);
    return res.rows[0] || null;
  }

  async findByProjectId(projectId, client) {
    const executor = client || getPool();
    const query = `
      SELECT id, title, status, project_id AS "projectId", created_at AS "createdAt"
      FROM tasks
      WHERE project_id = $1
      ORDER BY id ASC;
    `;
    const res = await executor.query(query, [projectId]);
    return res.rows;
  }

  async findAll(client) {
    const executor = client || getPool();
    const query = `
      SELECT id, title, status, project_id AS "projectId", created_at AS "createdAt"
      FROM tasks
      ORDER BY id ASC;
    `;
    const res = await executor.query(query);
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
    const res = await executor.query(query, [newStatus, id]);
    return res.rows[0] || null;
  }

  async deleteByProjectId(projectId, client) {
    const executor = client || getPool();
    const query = `DELETE FROM tasks WHERE project_id = $1 RETURNING id;`;
    const res = await executor.query(query, [projectId]);
    return res.rowCount;
  }
}

module.exports = new PostgresTaskRepository();
