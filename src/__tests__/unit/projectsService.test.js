// Unit tests for projectsService with a stub repository: input cleaning,
// Idempotency-Key validation and the request hash used to detect reuse.
const crypto = require('node:crypto');
const { setRepositories, resetRepositories } = require('../../repositories');
const {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
} = require('../../services/projectsService');
const { ValidationError, NotFoundError } = require('../../errors/AppError');

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

let projectRepo;
beforeEach(() => {
  projectRepo = {
    createWithTasks: jest.fn(async (input) => ({
      project: { id: 1, ...input },
      replayed: false,
    })),
    findAllWithTasks: jest.fn().mockResolvedValue([{ id: 1, tasks: [] }]),
    findByIdWithTasks: jest.fn().mockResolvedValue(null),
    deleteWithTasks: jest.fn().mockResolvedValue(null),
  };
  setRepositories({ projectRepo });
});
afterEach(() => resetRepositories());

const lastIdempotency = () => projectRepo.createWithTasks.mock.calls.at(-1)[1].idempotency;

describe('createProject — input', () => {
  it('passes the cleaned input to the repository', async () => {
    await createProject({
      name: '  Alpha ',
      userId: 2,
      initialTasks: [{ title: ' a ' }, { title: 'b', extra: 'dropped' }],
    });

    expect(projectRepo.createWithTasks).toHaveBeenCalledWith(
      { name: 'Alpha', userId: 2, initialTasks: [{ title: 'a' }, { title: 'b' }] },
      { idempotency: undefined }
    );
  });

  it('defaults initialTasks to [] and userId to null', async () => {
    await createProject({ name: 'Solo' });
    expect(projectRepo.createWithTasks.mock.calls[0][0]).toEqual({
      name: 'Solo',
      userId: null,
      initialTasks: [],
    });
  });

  it('returns the repository result, including the replayed flag', async () => {
    projectRepo.createWithTasks.mockResolvedValue({ project: { id: 9 }, replayed: true });
    await expect(createProject({ name: 'P' })).resolves.toEqual({
      project: { id: 9 },
      replayed: true,
    });
  });

  it.each([
    [{ name: '' }, 'Project name is required and cannot be empty'],
    [{ name: 'P', userId: 0 }, 'userId must be a positive integer when provided'],
    [{ name: 'P', initialTasks: {} }, 'initialTasks must be an array when provided'],
    [{ name: 'P', initialTasks: [null] }, 'initialTasks[0] must be an object with a title'],
    [{ name: 'P', initialTasks: ['text'] }, 'initialTasks[0] must be an object with a title'],
    [
      { name: 'P', initialTasks: [{ title: 'ok' }, { title: ' ' }] },
      'initialTasks[1].title is required and cannot be empty',
    ],
  ])('rejects %j with "%s" and calls no repository', async (input, message) => {
    await expect(createProject(input)).rejects.toThrow(new ValidationError(message));
    expect(projectRepo.createWithTasks).not.toHaveBeenCalled();
  });
});

describe('createProject — Idempotency-Key', () => {
  it('builds { scope, key, requestHash } from the validated input', async () => {
    await createProject({ name: ' P ', initialTasks: [{ title: 't' }] }, { idempotencyKey: 'k1' });

    expect(lastIdempotency()).toEqual({
      scope: 'POST /projects',
      key: 'k1',
      requestHash: sha256({ name: 'P', userId: null, initialTasks: [{ title: 't' }] }),
    });
  });

  it('gives the same hash for requests that differ only in whitespace', async () => {
    await createProject({ name: 'P' }, { idempotencyKey: 'k' });
    const first = lastIdempotency().requestHash;
    await createProject({ name: '   P   ' }, { idempotencyKey: 'k' });
    expect(lastIdempotency().requestHash).toBe(first);
  });

  it.each([
    [{ name: 'Q' }, 'different name'],
    [{ name: 'P', userId: 1 }, 'different userId'],
    [{ name: 'P', initialTasks: [{ title: 'x' }] }, 'different tasks'],
  ])('gives a different hash for %j (%s)', async (other) => {
    await createProject({ name: 'P' }, { idempotencyKey: 'k' });
    const first = lastIdempotency().requestHash;
    await createProject(other, { idempotencyKey: 'k' });
    expect(lastIdempotency().requestHash).not.toBe(first);
  });

  it.each([['a'], ['~'.repeat(255)], ['550e8400-e29b-41d4-a716-446655440000'], ['!#$%&*+-./']])(
    'accepts key %p',
    async (key) => {
      await createProject({ name: 'P' }, { idempotencyKey: key });
      expect(lastIdempotency().key).toBe(key);
    }
  );

  it.each([
    ['', 'empty'],
    ['x'.repeat(256), 'longer than 255'],
    ['has space', 'space'],
    ['ключ', 'non-ASCII'],
    ['tab\tkey', 'control character'],
    [123, 'not a string'],
    [null, 'null'],
  ])('rejects key %p (%s) before calling the repository', async (key) => {
    await expect(createProject({ name: 'P' }, { idempotencyKey: key })).rejects.toThrow(
      new ValidationError('Idempotency-Key must be 1-255 printable ASCII characters')
    );
    expect(projectRepo.createWithTasks).not.toHaveBeenCalled();
  });

  it('validates the body before the key (bad body + bad key -> body error)', async () => {
    await expect(createProject({ name: '' }, { idempotencyKey: '' })).rejects.toThrow(
      'Project name is required'
    );
  });
});

describe('getProjects / getProjectById / deleteProject', () => {
  it('getProjects returns the repository list', async () => {
    await expect(getProjects()).resolves.toEqual([{ id: 1, tasks: [] }]);
  });

  it('getProjectById returns the project', async () => {
    projectRepo.findByIdWithTasks.mockResolvedValue({ id: 4, tasks: [] });
    await expect(getProjectById('4')).resolves.toEqual({ id: 4, tasks: [] });
    expect(projectRepo.findByIdWithTasks).toHaveBeenCalledWith(4);
  });

  it('getProjectById throws NotFoundError with the id', async () => {
    const err = await getProjectById('4').catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Project with id 4 not found');
  });

  it('getProjectById validates the id with entity "project"', async () => {
    await expect(getProjectById('x')).rejects.toThrow('Invalid project id "x"');
    expect(projectRepo.findByIdWithTasks).not.toHaveBeenCalled();
  });

  it('deleteProject returns the repository result', async () => {
    projectRepo.deleteWithTasks.mockResolvedValue({ deletedTasks: 3 });
    await expect(deleteProject('4')).resolves.toEqual({ deletedTasks: 3 });
    expect(projectRepo.deleteWithTasks).toHaveBeenCalledWith(4);
  });

  it('deleteProject throws NotFoundError when nothing was deleted', async () => {
    const err = await deleteProject('4').catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Project with id 4 not found');
  });

  it('deleteProject validates the id with entity "project"', async () => {
    await expect(deleteProject('0')).rejects.toThrow('Invalid project id "0"');
    expect(projectRepo.deleteWithTasks).not.toHaveBeenCalled();
  });
});
