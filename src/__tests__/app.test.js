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

      // Verify rollback
      const projects = await projectRepo.findAll();
      expect(projects).toHaveLength(0);
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

      const res = await request(app).delete(`/projects/${project.body.id}`);
      expect(res.statusCode).toEqual(204);

      // Verify deletion
      const checkProject = await request(app).get(`/projects/${project.body.id}`);
      expect(checkProject.statusCode).toEqual(404);
    });

    it('returns 404 when deleting a non-existent project', async () => {
      const res = await request(app).delete('/projects/999');
      expect(res.statusCode).toEqual(404);
    });
  });
});
