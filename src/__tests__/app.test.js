const request = require('supertest');
const app = require('../app');
const projectRepo = require('../repositories/inMemory/inMemoryProjectRepository');
const taskRepo = require('../repositories/inMemory/inMemoryTaskRepository');

describe('Taskflow API — Core Scenarios on Prototype Data', () => {
  beforeEach(async () => {
    await projectRepo.reset();
    await taskRepo.reset();
  });

  describe('Infra & System endpoints', () => {
    it('GET /health returns 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('OK');
      expect(res.headers).toHaveProperty('x-process-id');
    });

    it('GET /version returns 200 with version string', async () => {
      const res = await request(app).get('/version');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('version');
      expect(typeof res.body.version).toBe('string');
    });

    it('propagates custom X-Process-ID from request into response and error payload', async () => {
      const customProcessId = 'custom-proc-12345';
      const res = await request(app)
        .post('/projects')
        .set('X-Process-ID', customProcessId)
        .send({ name: '' });

      expect(res.statusCode).toEqual(400);
      expect(res.headers['x-process-id']).toEqual(customProcessId);
      expect(res.body.error.processId).toEqual(customProcessId);
    });
  });

  describe('Scenario 1: Project & Initial Tasks Creation (POST /projects)', () => {
    it('creates a project with initial tasks atomically', async () => {
      const payload = {
        name: 'Sprint Alpha',
        userId: 1,
        initialTasks: [{ title: 'Setup database' }, { title: 'Implement endpoints' }],
      };

      const res = await request(app).post('/projects').send(payload);
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toEqual('Sprint Alpha');
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.tasks[0].title).toEqual('Setup database');
      expect(res.body.tasks[0].status).toEqual('TODO');
      expect(res.body.tasks[0].projectId).toEqual(res.body.id);
    });

    it('returns 400 VALIDATION_ERROR when project name is missing', async () => {
      const res = await request(app).post('/projects').send({ name: '   ' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
      expect(res.body.error).toHaveProperty('processId');
    });

    it('returns 400 and creates nothing when an initial task is invalid', async () => {
      const payload = {
        name: 'Broken Project',
        initialTasks: [{ title: 'Valid task' }, { title: '' }],
      };

      const res = await request(app).post('/projects').send(payload);
      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');

      // Validation runs before the repository, so neither the project nor the
      // first (valid) task may exist. Checking only projects missed orphan tasks.
      expect(await projectRepo.findAll()).toHaveLength(0);
      expect(await taskRepo.findAll()).toHaveLength(0);
    });
  });

  describe('Requests the controllers did not expect', () => {
    it.each([
      ['/tasks', 'Task title is required and cannot be empty'],
      ['/projects', 'Project name is required and cannot be empty'],
    ])('POST %s without a JSON body -> 400, not a 500 TypeError', async (url, message) => {
      const res = await request(app).post(url).set('Content-Type', 'text/plain').send('x');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message });
    });

    it('PATCH /tasks/:id/status without a body -> 400 invalid status', async () => {
      const { body: task } = await request(app).post('/tasks').send({ title: 'T' });
      const res = await request(app).patch(`/tasks/${task.id}/status`);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toContain('Invalid status: undefined');
    });

    it('malformed JSON -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/projects')
        .set('Content-Type', 'application/json')
        .send('{"name": ');
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('unknown route -> JSON 404 in the common error format', async () => {
      const res = await request(app).get('/nope').set('X-Process-ID', 'p-404');
      expect(res.statusCode).toBe(404);
      expect(res.type).toBe('application/json');
      expect(res.body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Route GET /nope not found',
        processId: 'p-404',
        details: null,
      });
    });
  });

  describe('POST /tasks', () => {
    it('stores and returns the title, projectId and default status', async () => {
      const { body: project } = await request(app).post('/projects').send({ name: 'P' });
      const res = await request(app)
        .post('/tasks')
        .send({ title: '  Write docs ', projectId: project.id });

      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Write docs',
        projectId: project.id,
        status: 'TODO',
      });
      const listed = await request(app).get('/tasks');
      expect(listed.body).toEqual([res.body]);
    });

    it('creates a task without a project (projectId null)', async () => {
      const res = await request(app).post('/tasks').send({ title: 'Inbox' });
      expect(res.statusCode).toBe(201);
      expect(res.body.projectId).toBeNull();
    });
  });

  describe('Scenario 2: Project Listing & Details without N+1 (GET /projects)', () => {
    it('returns empty array when no projects exist', async () => {
      const res = await request(app).get('/projects');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual([]);
    });

    it('retrieves project with nested tasks', async () => {
      const created = await request(app)
        .post('/projects')
        .send({
          name: 'Project One',
          initialTasks: [{ title: 'Task 1' }],
        });

      const res = await request(app).get(`/projects/${created.body.id}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(created.body.id);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toEqual('Task 1');
    });

    it('returns 404 NOT_FOUND for non-existent project', async () => {
      const res = await request(app).get('/projects/999');
      expect(res.statusCode).toEqual(404);
      expect(res.body.error.code).toEqual('NOT_FOUND');
    });
  });

  describe('Scenario 3: Task Status Lifecycle Transitions (PATCH /tasks/:id/status)', () => {
    it('allows valid transitions TODO -> IN_PROGRESS -> DONE', async () => {
      const taskRes = await request(app).post('/tasks').send({ title: 'Lifecycle task' });
      const taskId = taskRes.body.id;
      expect(taskRes.body.status).toEqual('TODO');

      // Step 1: TODO -> IN_PROGRESS
      const step1 = await request(app)
        .patch(`/tasks/${taskId}/status`)
        .send({ status: 'IN_PROGRESS' });
      expect(step1.statusCode).toEqual(200);
      expect(step1.body.status).toEqual('IN_PROGRESS');

      // Step 2: IN_PROGRESS -> DONE
      const step2 = await request(app).patch(`/tasks/${taskId}/status`).send({ status: 'DONE' });
      expect(step2.statusCode).toEqual(200);
      expect(step2.body.status).toEqual('DONE');
    });

    it('rejects illegal jump TODO -> DONE with 400', async () => {
      const taskRes = await request(app).post('/tasks').send({ title: 'Direct jump task' });
      const taskId = taskRes.body.id;

      const res = await request(app).patch(`/tasks/${taskId}/status`).send({ status: 'DONE' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
    });

    it.each([
      ['IN_PROGRESS', 'TODO'],
      ['DONE', 'IN_PROGRESS'],
      ['DONE', 'TODO'],
    ])('rejects transition %s -> %s that spec.md does not allow', async (from, to) => {
      const { body: task } = await request(app).post('/tasks').send({ title: 'T' });
      await request(app).patch(`/tasks/${task.id}/status`).send({ status: 'IN_PROGRESS' });
      if (from === 'DONE') {
        await request(app).patch(`/tasks/${task.id}/status`).send({ status: 'DONE' });
      }

      const res = await request(app).patch(`/tasks/${task.id}/status`).send({ status: to });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error.message).toContain(`from ${from} to ${to}`);
    });

    it('returns 404 for non-existent task status update', async () => {
      const res = await request(app).patch('/tasks/999/status').send({ status: 'IN_PROGRESS' });
      expect(res.statusCode).toEqual(404);
      expect(res.body.error.code).toEqual('NOT_FOUND');
    });
  });

  describe('Scenario 4: Project Deletion (DELETE /projects/:id)', () => {
    it('deletes project and its associated tasks', async () => {
      const project = await request(app)
        .post('/projects')
        .send({
          name: 'To be deleted',
          initialTasks: [{ title: 'Task to be deleted' }],
        });

      const other = await request(app)
        .post('/projects')
        .send({ name: 'Keep me', initialTasks: [{ title: 'Survivor' }] });

      const res = await request(app).delete(`/projects/${project.body.id}`);
      expect(res.statusCode).toEqual(204);
      expect(res.text).toBe('');

      // Verify deletion
      const checkProject = await request(app).get(`/projects/${project.body.id}`);
      expect(checkProject.statusCode).toEqual(404);

      // The cascade part of Scenario 4: the project's tasks are gone, other
      // projects' tasks are untouched. Earlier the test only checked the 404.
      const tasks = await request(app).get('/tasks');
      expect(tasks.body.map((t) => t.title)).toEqual(['Survivor']);
      expect(tasks.body[0].projectId).toBe(other.body.id);
    });

    it('returns 404 when deleting a non-existent project', async () => {
      const res = await request(app).delete('/projects/999');
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('Input validation (400 instead of 500)', () => {
    it.each(['abc', '1.5', '-1', '0', '99999999999'])(
      'GET /projects/%s returns 400 VALIDATION_ERROR',
      async (id) => {
        const res = await request(app).get(`/projects/${id}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body.error.code).toEqual('VALIDATION_ERROR');
      }
    );

    it('DELETE /projects/abc returns 400', async () => {
      const res = await request(app).delete('/projects/abc');
      expect(res.statusCode).toEqual(400);
    });

    it('PATCH /tasks/abc/status returns 400', async () => {
      const res = await request(app).patch('/tasks/abc/status').send({ status: 'IN_PROGRESS' });
      expect(res.statusCode).toEqual(400);
    });

    it.each(['01', '1e3', '2147483648'])(
      'GET /projects/%s is rejected even though Number() would parse it',
      async (id) => {
        const res = await request(app).get(`/projects/${id}`);
        expect(res.statusCode).toEqual(400);
      }
    );

    it('accepts a name of exactly 255 characters and an explicit userId: null', async () => {
      const name = 'n'.repeat(255);
      const res = await request(app).post('/projects').send({ name, userId: null });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(name);
      expect(res.body.userId).toBeNull();
    });

    it.each([
      [{ name: 'P', userId: 0 }, 'userId'],
      [{ name: 'P', userId: -1 }, 'userId'],
      [{ name: 'P', userId: 1.5 }, 'userId'],
      [{ name: 'P', userId: 'abc' }, 'userId'],
      [{ name: 'P', initialTasks: 'not-an-array' }, 'initialTasks'],
      [{ name: 'P', initialTasks: [null] }, 'initialTasks[0]'],
      [{ name: 'x'.repeat(256) }, '255'],
    ])('POST /projects %j returns 400', async (body, fragment) => {
      const res = await request(app).post('/projects').send(body);
      expect(res.statusCode).toEqual(400);
      expect(res.body.error.message).toContain(fragment);
    });

    it.each(['x', 1.5, 0, -2])('POST /tasks with projectId %p returns 400', async (projectId) => {
      const res = await request(app).post('/tasks').send({ title: 'T', projectId });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error.message).toBe('projectId must be a positive integer when provided');
      expect(await taskRepo.findAll()).toHaveLength(0);
    });

    it('PATCH /tasks/:id/status with an unknown status returns 400 and keeps the task', async () => {
      const { body: task } = await request(app).post('/tasks').send({ title: 'T' });
      const res = await request(app).patch(`/tasks/${task.id}/status`).send({ status: 'CLOSED' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toContain('Allowed values: TODO, IN_PROGRESS, DONE');
      expect((await taskRepo.findById(task.id)).status).toBe('TODO');
    });
  });

  describe('Logging: processId on every layer', () => {
    let logSpy;
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
      logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      process.env.LOG_LEVEL = 'silent';
      logSpy.mockRestore();
    });

    it('request, route, service, repository and response lines share the processId', async () => {
      const processId = 'trace-me-42';
      await request(app)
        .post('/projects')
        .set('X-Process-ID', processId)
        .send({ name: 'Traced', initialTasks: [{ title: 'one' }] });

      const lines = logSpy.mock.calls.map((c) => c[0]);
      const ours = lines.filter((l) => l.includes(`[Process: ${processId}]`));

      for (const marker of [
        '--> POST',
        '[route] /projects',
        '[service] createProject',
        '[memory] project.createWithTasks',
        '<-- POST /projects 201',
      ]) {
        expect(ours.some((l) => l.includes(marker))).toBe(true);
      }
      expect(ours).toHaveLength(lines.length);
    });
  });

  describe('Idempotency-Key on POST /projects', () => {
    const body = { name: 'Idem', initialTasks: [{ title: 'a' }] };

    it('replays the stored response and creates nothing on a retry with the same key', async () => {
      const first = await request(app).post('/projects').set('Idempotency-Key', 'k-1').send(body);
      const retry = await request(app).post('/projects').set('Idempotency-Key', 'k-1').send(body);

      expect(first.statusCode).toBe(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(retry.statusCode).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await projectRepo.findAll()).toHaveLength(1);
      expect(await taskRepo.findAll()).toHaveLength(1);
    });

    it('treats whitespace-only differences as the same request (hash of validated input)', async () => {
      await request(app).post('/projects').set('Idempotency-Key', 'k-2').send(body);
      const retry = await request(app)
        .post('/projects')
        .set('Idempotency-Key', 'k-2')
        .send({ ...body, name: '  Idem  ' });
      expect(retry.headers['idempotent-replayed']).toBe('true');
    });

    it('returns 409 CONFLICT_ERROR when the key is reused with a different body', async () => {
      await request(app).post('/projects').set('Idempotency-Key', 'k-3').send(body);
      const res = await request(app)
        .post('/projects')
        .set('Idempotency-Key', 'k-3')
        .send({ name: 'Other' });
      expect(res.statusCode).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT_ERROR');
      expect(await projectRepo.findAll()).toHaveLength(1);
    });

    it('does not store a key for a request that failed validation', async () => {
      const bad = await request(app).post('/projects').set('Idempotency-Key', 'k-4').send({});
      expect(bad.statusCode).toBe(400);
      const ok = await request(app).post('/projects').set('Idempotency-Key', 'k-4').send(body);
      expect(ok.statusCode).toBe(201);
      expect(ok.headers['idempotent-replayed']).toBeUndefined();
    });

    it('creates a new project for each request without a key', async () => {
      await request(app).post('/projects').send(body);
      await request(app).post('/projects').send(body);
      expect(await projectRepo.findAll()).toHaveLength(2);
    });

    it('rejects a key longer than 255 characters with 400', async () => {
      const res = await request(app)
        .post('/projects')
        .set('Idempotency-Key', 'x'.repeat(256))
        .send(body);
      expect(res.statusCode).toBe(400);
    });
  });
});
