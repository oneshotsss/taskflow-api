// End-to-end user journey against the running service (see globalSetup.js).
// Black box: only HTTP via fetch, no imports from src/, no direct SQL.
// Steps run in order and share state, like one client session would.
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');

const BASE = process.env.E2E_BASE_URL;

const api = async (method, path, { body, headers = {} } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};

beforeAll(() => {
  if (!BASE) throw new Error('E2E_BASE_URL is not set — run via jest.e2e.config.js');
});

describe('infrastructure', () => {
  it('GET /health answers and assigns a processId', async () => {
    const res = await api('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'OK' });
    expect(res.headers.get('x-process-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /version reports the commit the server runs from', async () => {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    expect((await api('GET', '/version')).body).toEqual({ version: sha });
  });

  it('the schema was created by the server on startup (fresh database is empty)', async () => {
    expect((await api('GET', '/projects')).body).toEqual([]);
    expect((await api('GET', '/tasks')).body).toEqual([]);
  });
});

describe('journey: plan a sprint, work on it, clean up', () => {
  const state = {};
  const sprint = {
    name: 'Sprint 42',
    initialTasks: [{ title: 'Design API' }, { title: 'Write tests' }],
  };

  it('1. creates a project with tasks (Idempotency-Key set by the client)', async () => {
    const res = await api('POST', '/projects', {
      body: sprint,
      headers: { 'Idempotency-Key': 'e2e-sprint-42' },
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('idempotent-replayed')).toBeNull();
    expect(res.body).toMatchObject({ name: 'Sprint 42', userId: null });
    expect(res.body.tasks.map((t) => [t.title, t.status, t.projectId])).toEqual([
      ['Design API', 'TODO', res.body.id],
      ['Write tests', 'TODO', res.body.id],
    ]);
    state.project = res.body;
  });

  it('2. a network retry with the same key returns the same project, creates nothing', async () => {
    const retry = await api('POST', '/projects', {
      body: sprint,
      headers: { 'Idempotency-Key': 'e2e-sprint-42' },
    });
    expect(retry.status).toBe(201);
    expect(retry.headers.get('idempotent-replayed')).toBe('true');
    expect(retry.body).toEqual(state.project);
    expect((await api('GET', '/projects')).body).toHaveLength(1);
  });

  it('3. the same key with another body is refused with 409', async () => {
    const res = await api('POST', '/projects', {
      body: { name: 'Other' },
      headers: { 'Idempotency-Key': 'e2e-sprint-42' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT_ERROR');
  });

  it('4. reading the project returns exactly what was created', async () => {
    expect((await api('GET', `/projects/${state.project.id}`)).body).toEqual(state.project);
    expect((await api('GET', '/projects')).body).toEqual([state.project]);
  });

  it('5. adds one more task to the project and a second project with its own task', async () => {
    const extra = await api('POST', '/tasks', {
      body: { title: 'Deploy', projectId: state.project.id },
    });
    expect(extra.status).toBe(201);
    state.deployTask = extra.body;

    const other = await api('POST', '/projects', {
      body: { name: 'Backlog', initialTasks: [{ title: 'Someday' }] },
    });
    state.other = other.body;

    const project = await api('GET', `/projects/${state.project.id}`);
    expect(project.body.tasks.map((t) => t.title)).toEqual(['Design API', 'Write tests', 'Deploy']);
  });

  it('6. moves a task TODO -> IN_PROGRESS -> DONE; every other move is refused', async () => {
    const id = state.project.tasks[0].id;
    const move = (status) => api('PATCH', `/tasks/${id}/status`, { body: { status } });

    expect((await move('DONE')).status).toBe(400);
    const started = await move('IN_PROGRESS');
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ id, status: 'IN_PROGRESS' });
    expect((await move('TODO')).status).toBe(400);
    expect((await move('DONE')).body.status).toBe('DONE');
    expect((await move('IN_PROGRESS')).status).toBe(400);

    const tasks = (await api('GET', '/tasks')).body;
    expect(tasks.find((t) => t.id === id).status).toBe('DONE');
    expect(tasks.filter((t) => t.status === 'DONE')).toHaveLength(1);
  });

  it('7. deletes the project with all its tasks; the other project is untouched', async () => {
    const del = await api('DELETE', `/projects/${state.project.id}`);
    expect(del.status).toBe(204);
    expect(del.body).toBeNull();

    expect((await api('GET', `/projects/${state.project.id}`)).status).toBe(404);
    expect((await api('DELETE', `/projects/${state.project.id}`)).status).toBe(404);
    const tasks = (await api('GET', '/tasks')).body;
    expect(tasks.map((t) => t.title)).toEqual(['Someday']);
    expect((await api('GET', '/projects')).body).toEqual([state.other]);
  });

  it('8. a task cannot be attached to the deleted project (FK -> 400, not 500)', async () => {
    const res = await api('POST', '/tasks', {
      body: { title: 'Orphan', projectId: state.project.id },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Project referenced by projectId does not exist');
  });
});

describe('error contract seen by a client', () => {
  it.each([
    ['GET', '/projects/abc', undefined, 400, 'VALIDATION_ERROR'],
    ['GET', '/projects/2147483648', undefined, 400, 'VALIDATION_ERROR'],
    ['POST', '/projects', '{"name": ', 400, 'VALIDATION_ERROR'],
    ['POST', '/projects', { name: 'P', userId: 999 }, 400, 'VALIDATION_ERROR'],
    ['POST', '/tasks', { title: 'x'.repeat(256) }, 400, 'VALIDATION_ERROR'],
    ['PATCH', '/tasks/999999/status', { status: 'DONE' }, 404, 'NOT_FOUND'],
    ['GET', '/no-such-route', undefined, 404, 'NOT_FOUND'],
  ])('%s %s -> %d %s in JSON', async (method, path, body, status, code) => {
    const res = await api(method, path, { body, headers: { 'X-Process-ID': 'e2e-err' } });
    expect(res.status).toBe(status);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.body.error).toMatchObject({ code, processId: 'e2e-err' });
  });
});

describe('observability', () => {
  it('every layer logs the processId the client sent', async () => {
    const processId = 'e2e-trace-7f3a';
    await api('POST', '/projects', {
      body: { name: 'Traced', initialTasks: [{ title: 't' }] },
      headers: { 'X-Process-ID': processId },
    });

    const expected = [
      '--> POST /projects',
      '[route] /projects',
      '[service] createProject',
      '[db] BEGIN',
      '[db] INSERT INTO projects',
      '[db] COMMIT',
      '<-- POST /projects 201',
    ];
    let ours = [];
    for (let i = 0; i < 20; i++) {
      // the log stream is flushed asynchronously by the child process
      const lines = fs.readFileSync(process.env.E2E_SERVER_LOG, 'utf8').split('\n');
      ours = lines.filter((l) => l.includes(`[Process: ${processId}]`));
      if (expected.every((m) => ours.some((l) => l.includes(m)))) break;
      await sleep(50);
    }
    for (const marker of expected) {
      expect(ours.some((l) => l.includes(marker))).toBe(true);
    }
  });
});
