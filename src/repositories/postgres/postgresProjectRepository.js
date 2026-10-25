const { getPool, withTransaction } = require('../../db/pool');

class PostgresProjectRepository {
  async create({ name, userId }, client) {
    const executor = client || getPool();
    const query = `
      INSERT INTO projects (name, user_id)
      VALUES ($1, $2)
      RETURNING id, name, user_id AS "userId", created_at AS "createdAt";
    `;
    const res = await executor.query(query, [name, userId || null]);
    return res.rows[0];
  }

  async findById(id, client) {
    const executor = client || getPool();
    const query = `
      SELECT id, name, user_id AS "userId", created_at AS "createdAt"
      FROM projects
      WHERE id = $1;
    `;
    const res = await executor.query(query, [id]);
    return res.rows[0] || null;
  }

  async findAll(client) {
    const executor = client || getPool();
    const query = `
      SELECT id, name, user_id AS "userId", created_at AS "createdAt"
      FROM projects
      ORDER BY id ASC;
    `;
    const res = await executor.query(query);
    return res.rows;
  }

  async delete(id, client) {
    const executor = client || getPool();
    const query = `DELETE FROM projects WHERE id = $1 RETURNING id;`;
    const res = await executor.query(query, [id]);
    return res.rowCount > 0;
  }

  async createWithTasks({ name, userId, initialTasks }) {
    return await withTransaction(async (client) => {
      const project = await this.create({ name, userId }, client);
      const tasks = [];

      for (const t of initialTasks) {
        const taskQuery = `
          INSERT INTO tasks (title, status, project_id)
          VALUES ($1, 'TODO', $2)
          RETURNING id, title, status, project_id AS "projectId", created_at AS "createdAt";
        `;
        const taskRes = await client.query(taskQuery, [t.title, project.id]);
        tasks.push(taskRes.rows[0]);
      }

      return { ...project, tasks };
    });
  }
}

module.exports = new PostgresProjectRepository();
