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
});
