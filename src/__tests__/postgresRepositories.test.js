const { withTransaction, initDatabase, setPool, closePool } = require('../db/pool');
const { DatabaseError } = require('../errors/AppError');

describe('PostgreSQL Pool and Transaction Management', () => {
  afterEach(async () => {
    await closePool();
  });

  it('fails fast on startup if database is unreachable (SELECT NOW() fails)', async () => {
    // Mock pool that fails
    const mockFailingPool = {
      query: jest.fn().mockRejectedValue(new Error('Connection refused')),
      on: jest.fn(),
      end: jest.fn().mockResolvedValue(),
    };

    setPool(mockFailingPool);

    await expect(initDatabase()).rejects.toThrow(DatabaseError);
    expect(mockFailingPool.query).toHaveBeenCalledWith('SELECT NOW() AS now');
  });

  it('rolls back transaction and releases client if an error occurs inside withTransaction', async () => {
    const mockClient = {
      query: jest.fn().mockImplementation((q) => {
        if (q === 'BEGIN') return Promise.resolve();
        if (q === 'ROLLBACK') return Promise.resolve();
        if (q.includes('INSERT INTO tasks')) {
          return Promise.reject(new Error('DB constraint error'));
        }
        return Promise.resolve({ rows: [{ id: 1 }] });
      }),
      release: jest.fn(),
    };

    const mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      on: jest.fn(),
      end: jest.fn().mockResolvedValue(),
    };

    setPool(mockPool);

    await expect(
      withTransaction(async (client) => {
        await client.query('INSERT INTO projects (name) VALUES ($1)', ['Test']);
        await client.query('INSERT INTO tasks (title) VALUES ($1)', ['Broken']);
      })
    ).rejects.toThrow('DB constraint error');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('commits transaction and releases client on successful completion', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
      release: jest.fn(),
    };

    const mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      on: jest.fn(),
      end: jest.fn().mockResolvedValue(),
    };

    setPool(mockPool);

    const result = await withTransaction(async (client) => {
      const res = await client.query('INSERT INTO projects (name) VALUES ($1)', ['Test']);
      return res.rows[0];
    });

    expect(result).toEqual({ id: 1 });
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  describe('N+1 Query Elimination in PostgresProjectRepository', () => {
    it('executes exactly 1 single SQL query with LEFT JOIN and json_agg to fetch projects with tasks', async () => {
      const postgresProjectRepo = require('../repositories/postgres/postgresProjectRepository');

      const mockRows = [
        {
          id: 1,
          name: 'Sprint Alpha',
          userId: 1,
          createdAt: new Date().toISOString(),
          tasks: [
            { id: 10, title: 'Task 1', status: 'TODO', projectId: 1 },
            { id: 11, title: 'Task 2', status: 'IN_PROGRESS', projectId: 1 },
          ],
        },
      ];

      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: mockRows }),
        on: jest.fn(),
        end: jest.fn().mockResolvedValue(),
      };

      setPool(mockPool);

      const projects = await postgresProjectRepo.findAllWithTasks();

      // Exactly 1 query executed — NO loop queries per project
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const executedSql = mockPool.query.mock.calls[0][0];
      expect(executedSql).toContain('LEFT JOIN tasks');
      expect(executedSql).toContain('json_agg');
      expect(projects).toEqual(mockRows);
    });
  });

  describe('Transactional project deletion (Scenario 4)', () => {
    const postgresProjectRepo = require('../repositories/postgres/postgresProjectRepository');

    const makePool = (client) => ({
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
      on: jest.fn(),
      end: jest.fn().mockResolvedValue(),
    });

    it('deletes tasks and project on one client between BEGIN and COMMIT', async () => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 2 }),
        release: jest.fn(),
      };
      const pool = makePool(client);
      setPool(pool);

      const result = await postgresProjectRepo.deleteWithTasks(1);

      const statements = client.query.mock.calls.map((c) => c[0].trim());
      expect(statements[0]).toBe('BEGIN');
      expect(statements[1]).toMatch(/^DELETE FROM tasks/);
      expect(statements[2]).toMatch(/^DELETE FROM projects/);
      expect(statements[3]).toBe('COMMIT');
      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedTasks: 2 });
    });

    it('rolls back task deletion when deleting the project fails', async () => {
      const client = {
        query: jest.fn().mockImplementation((q) => {
          if (q.startsWith('DELETE FROM projects')) return Promise.reject(new Error('boom'));
          return Promise.resolve({ rows: [], rowCount: 1 });
        }),
        release: jest.fn(),
      };
      setPool(makePool(client));

      await expect(postgresProjectRepo.deleteWithTasks(1)).rejects.toThrow('boom');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query).not.toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('PostgreSQL error translation', () => {
    const { translatePgError } = require('../db/query');
    const { ValidationError, ConflictError } = require('../errors/AppError');
    const postgresProjectRepo = require('../repositories/postgres/postgresProjectRepository');

    const pgError = (code, constraint) => Object.assign(new Error('pg'), { code, constraint });

    it('maps FK violation on projects.user_id to a 400 ValidationError', () => {
      const err = translatePgError(pgError('23503', 'projects_user_id_fkey'));
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('userId');
    });

    it('maps unique violation to 409 ConflictError', () => {
      expect(translatePgError(pgError('23505'))).toBeInstanceOf(ConflictError);
    });

    it('leaves unknown errors untouched (they stay 500)', () => {
      const original = pgError('08006');
      expect(translatePgError(original)).toBe(original);
    });

    it('createWithTasks with unknown userId rolls back and throws ValidationError', async () => {
      const client = {
        query: jest.fn().mockImplementation((q) => {
          if (q.includes('INSERT INTO projects')) {
            return Promise.reject(pgError('23503', 'projects_user_id_fkey'));
          }
          return Promise.resolve({ rows: [] });
        }),
        release: jest.fn(),
      };
      setPool({ connect: jest.fn().mockResolvedValue(client), on: jest.fn(), end: jest.fn() });

      await expect(
        postgresProjectRepo.createWithTasks({ name: 'P', userId: 999, initialTasks: [] })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Transaction retries on transient errors', () => {
    const { MAX_TX_ATTEMPTS } = require('../db/pool');
    const transient = (code) => Object.assign(new Error('transient'), { code });

    const setupClient = () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
      setPool({ connect: jest.fn().mockResolvedValue(client), on: jest.fn(), end: jest.fn() });
      return client;
    };

    it.each(['40001', '40P01'])('re-runs the transaction after SQLSTATE %s', async (code) => {
      const client = setupClient();
      const callback = jest.fn().mockRejectedValueOnce(transient(code)).mockResolvedValue('ok');

      await expect(withTransaction(callback)).resolves.toBe('ok');
      expect(callback).toHaveBeenCalledTimes(2);
      const statements = client.query.mock.calls.map((c) => c[0]);
      expect(statements).toEqual(['BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT']);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('gives up after MAX_TX_ATTEMPTS', async () => {
      setupClient();
      const callback = jest.fn().mockRejectedValue(transient('40001'));
      await expect(withTransaction(callback)).rejects.toThrow('transient');
      expect(callback).toHaveBeenCalledTimes(MAX_TX_ATTEMPTS);
    });

    it('does not retry non-transient errors', async () => {
      setupClient();
      const callback = jest.fn().mockRejectedValue(transient('23503'));
      await expect(withTransaction(callback)).rejects.toThrow();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
