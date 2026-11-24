// Runs the spec.md scenarios against a real PostgreSQL test database.
// Start the DB first: `docker compose up -d`, then `npm run test:integration`.
const request = require('supertest');
const app = require('../../app');
const { getPool, closePool } = require('../../db/pool');
const { repoType } = require('../../config');

const db = () => getPool();
const count = async (table) =>
  Number((await db().query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);

beforeAll(() => {
  // Guard: this file must never fall back to the in-memory repositories.
  expect(repoType).toBe('postgres');
});

beforeEach(async () => {
  await db().query('TRUNCATE idempotency_keys, tasks, projects, users RESTART IDENTITY CASCADE');
  await db().query(`INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')`);
});

afterAll(async () => {
  await closePool();
});

const createProject = (body, key) => {
  const req = request(app).post('/projects');
  if (key) req.set('Idempotency-Key', key);
  return req.send(body);
};

describe('Scenario 1: POST /projects (transaction)', () => {
  it('stores project and tasks in PostgreSQL', async () => {
    const res = await createProject({
      name: 'Sprint Alpha',
      userId: 1,
      initialTasks: [{ title: 'Setup environment' }, { title: 'Implement auth' }],
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.userId).toBe(1);
    expect(res.body.tasks.map((t) => t.status)).toEqual(['TODO', 'TODO']);
    expect(await count('projects')).toBe(1);
    expect(await count('tasks')).toBe(2);
  });

  it('returns 400 for a userId that does not exist and leaves no rows behind', async () => {
    const res = await createProject({
      name: 'Orphan',
      userId: 999,
      initialTasks: [{ title: 'never stored' }],
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('userId');
    expect(await count('projects')).toBe(0);
    expect(await count('tasks')).toBe(0);
  });
});

describe('Scenario 2: GET /projects without N+1', () => {
  it('returns every project with its tasks using exactly one SQL query', async () => {
    for (let i = 1; i <= 3; i++) {
      await createProject({
        name: `P${i}`,
        initialTasks: [{ title: `T${i}a` }, { title: `T${i}b` }],
      });
    }

    const spy = jest.spyOn(db(), 'query');
    const res = await request(app).get('/projects');
    const queries = spy.mock.calls.length;
    spy.mockRestore();

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((p) => p.tasks.length === 2)).toBe(true);
    expect(queries).toBe(1);
  });

  it('returns 404 for a missing project and 400 for a non-numeric id', async () => {
    expect((await request(app).get('/projects/12345')).statusCode).toBe(404);
    expect((await request(app).get('/projects/abc')).statusCode).toBe(400);
  });

  // Regression: tasks in GET come from json_agg (PostgreSQL renders timestamptz
  // as "…06.478225+00:00"), while POST returns them through the pg driver
  // ("…06.478Z"). The same task had two different createdAt values. The
  // in-memory tests cannot see this: there every timestamp is an ISO string.
  it('GET /projects/:id and GET /projects return exactly what POST returned', async () => {
    const { body: created } = await createProject({
      name: 'Same shape',
      userId: 1,
      initialTasks: [{ title: 'a' }, { title: 'b' }],
    });
    const { body: empty } = await createProject({ name: 'No tasks' });

    const one = await request(app).get(`/projects/${created.id}`);
    const all = await request(app).get('/projects');

    expect(one.body).toEqual(created);
    expect(all.body).toEqual([created, empty]);
    expect(empty.tasks).toEqual([]);
    for (const task of created.tasks) {
      expect(task.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    }
  });
});

describe('Scenario 3: PATCH /tasks/:id/status', () => {
  it('follows TODO -> IN_PROGRESS -> DONE and rejects anything else', async () => {
    const { body: project } = await createProject({ name: 'P', initialTasks: [{ title: 'T' }] });
    const id = project.tasks[0].id;
    const patch = (status) => request(app).patch(`/tasks/${id}/status`).send({ status });

    expect((await patch('DONE')).statusCode).toBe(400); // TODO -> DONE
    expect((await patch('IN_PROGRESS')).statusCode).toBe(200);
    expect((await patch('TODO')).statusCode).toBe(400); // IN_PROGRESS -> TODO
    expect((await patch('DONE')).statusCode).toBe(200);

    const stored = await db().query('SELECT status FROM tasks WHERE id = $1', [id]);
    expect(stored.rows[0].status).toBe('DONE');
  });

  it('returns 404 for a task that does not exist and writes nothing', async () => {
    const res = await request(app).patch('/tasks/4242/status').send({ status: 'IN_PROGRESS' });
    expect(res.statusCode).toBe(404);
    expect(await count('tasks')).toBe(0);
  });
});

// Previously only covered on the in-memory prototype: the SQL behind
// POST /tasks and GET /tasks never ran against PostgreSQL in any test.
describe('POST /tasks and GET /tasks', () => {
  it('stores a task in a project and a task without one, lists them in id order', async () => {
    const { body: project } = await createProject({ name: 'P' });
    const inProject = await request(app).post('/tasks').send({ title: 'A', projectId: project.id });
    const loose = await request(app).post('/tasks').send({ title: 'B' });

    expect(inProject.statusCode).toBe(201);
    expect(inProject.body).toMatchObject({ title: 'A', status: 'TODO', projectId: project.id });
    expect(loose.body.projectId).toBeNull();

    const rows = await db().query('SELECT title, status, project_id FROM tasks ORDER BY id');
    expect(rows.rows).toEqual([
      { title: 'A', status: 'TODO', project_id: project.id },
      { title: 'B', status: 'TODO', project_id: null },
    ]);
    const list = await request(app).get('/tasks');
    expect(list.body).toEqual([inProject.body, loose.body]);
  });

  it('returns 400 (FK) for a projectId that does not exist', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A', projectId: 777 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Project referenced by projectId does not exist',
      details: { constraint: 'tasks_project_id_fkey' },
    });
    expect(await count('tasks')).toBe(0);
  });
});

describe('Scenario 4: DELETE /projects/:id', () => {
  it('removes the project and its tasks', async () => {
    const { body: keep } = await createProject({ name: 'Keep', initialTasks: [{ title: 'k' }] });
    const { body: drop } = await createProject({
      name: 'Drop',
      initialTasks: [{ title: 'd1' }, { title: 'd2' }],
    });

    const res = await request(app).delete(`/projects/${drop.id}`);

    expect(res.statusCode).toBe(204);
    expect(await count('projects')).toBe(1);
    const left = await db().query('SELECT project_id FROM tasks');
    expect(left.rows).toEqual([{ project_id: keep.id }]);
  });

  it('returns 404 for a missing project and 400 for a non-numeric id', async () => {
    expect((await request(app).delete('/projects/12345')).statusCode).toBe(404);
    expect((await request(app).delete('/projects/abc')).statusCode).toBe(400);
  });
});

describe('Idempotency-Key', () => {
  const body = { name: 'Idem', userId: 1, initialTasks: [{ title: 'once' }] };

  it('a sequential retry replays the response and creates nothing', async () => {
    const first = await createProject(body, 'retry-1');
    const retry = await createProject(body, 'retry-1');

    expect(retry.statusCode).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await count('projects')).toBe(1);
    expect(await count('tasks')).toBe(1);
  });

  it('concurrent requests with the same key create exactly one project', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => createProject(body, 'race-1'))
    );

    expect(responses.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(responses.filter((r) => r.headers['idempotent-replayed']).length).toBe(4);
    expect(await count('projects')).toBe(1);
  });

  it('reusing a key with a different body returns 409', async () => {
    await createProject(body, 'conflict-1');
    const res = await createProject({ ...body, name: 'Different' }, 'conflict-1');
    expect(res.statusCode).toBe(409);
    expect(await count('projects')).toBe(1);
  });

  it('a key that is stored without a response is reported as in progress (409)', async () => {
    // State a crashed writer would leave behind if the claim were ever committed
    // separately from the project (the safety net in resolveStoredKey).
    const { createHash } = require('node:crypto');
    const hash = createHash('sha256')
      .update(JSON.stringify({ name: 'Idem', userId: 1, initialTasks: [{ title: 'once' }] }))
      .digest('hex');
    await db().query(
      `INSERT INTO idempotency_keys (scope, key, request_hash) VALUES ('POST /projects', 'stuck-1', $1)`,
      [hash]
    );

    const res = await createProject(body, 'stuck-1');
    expect(res.statusCode).toBe(409);
    expect(res.body.error.message).toBe('A request with this Idempotency-Key is still in progress');
    expect(await count('projects')).toBe(0);
  });

  it('a request rolled back by an FK error does not keep its key', async () => {
    const bad = await createProject({ ...body, userId: 999 }, 'rollback-1');
    expect(bad.statusCode).toBe(400);
    expect(await count('idempotency_keys')).toBe(0);

    const good = await createProject({ ...body, userId: 999 }, 'rollback-1');
    expect(good.statusCode).toBe(400); // still re-validated, not replayed
  });
});
