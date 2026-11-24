// Unit tests for the task lifecycle rules. The repository is a stub, so these
// tests check only the service's decisions: what it validates, what it passes
// to the repository and what it refuses to write.
const { setRepositories, resetRepositories } = require('../../repositories');
const { fetchAllTasks, addTask, updateTaskStatus } = require('../../services/tasksService');
const { ValidationError, NotFoundError } = require('../../errors/AppError');

const makeTaskRepo = (existing) => ({
  findAll: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
  create: jest.fn(async (data) => ({ id: 10, ...data })),
  findById: jest.fn().mockResolvedValue(existing),
  updateStatus: jest.fn(async (id, status) => ({ ...existing, status })),
});

let taskRepo;
const useRepo = (existing = null) => {
  taskRepo = makeTaskRepo(existing);
  setRepositories({ taskRepo });
};

afterEach(() => resetRepositories());

describe('fetchAllTasks', () => {
  it('returns what the repository returns', async () => {
    useRepo();
    await expect(fetchAllTasks()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('addTask', () => {
  it('passes trimmed title, projectId and status TODO to the repository', async () => {
    useRepo();
    const task = await addTask({ title: '  Write tests ', projectId: 3 });

    expect(taskRepo.create).toHaveBeenCalledWith({
      title: 'Write tests',
      projectId: 3,
      status: 'TODO',
    });
    expect(task).toEqual({ id: 10, title: 'Write tests', projectId: 3, status: 'TODO' });
  });

  it('stores projectId as null when it is not provided', async () => {
    useRepo();
    await addTask({ title: 'Loose task' });
    expect(taskRepo.create).toHaveBeenCalledWith({
      title: 'Loose task',
      projectId: null,
      status: 'TODO',
    });
  });

  it('rejects an empty title and writes nothing', async () => {
    useRepo();
    await expect(addTask({ title: ' ' })).rejects.toThrow(
      new ValidationError('Task title is required and cannot be empty')
    );
    expect(taskRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a non-integer projectId and writes nothing', async () => {
    useRepo();
    await expect(addTask({ title: 'T', projectId: 1.5 })).rejects.toThrow(
      'projectId must be a positive integer when provided'
    );
    expect(taskRepo.create).not.toHaveBeenCalled();
  });
});

describe('updateTaskStatus — state machine from spec.md (TODO -> IN_PROGRESS -> DONE)', () => {
  const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];
  const ALLOWED = { TODO: ['IN_PROGRESS'], IN_PROGRESS: ['DONE'], DONE: [] };

  // All 9 (from, to) pairs, so adding or removing any edge breaks a test.
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to]));

  it.each(pairs.filter(([from, to]) => ALLOWED[from].includes(to)))(
    'allows %s -> %s and writes the new status',
    async (from, to) => {
      useRepo({ id: 5, status: from });
      const updated = await updateTaskStatus('5', to);

      expect(taskRepo.findById).toHaveBeenCalledWith(5);
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(5, to);
      expect(updated.status).toBe(to);
    }
  );

  it.each(pairs.filter(([from, to]) => !ALLOWED[from].includes(to)))(
    'rejects %s -> %s and writes nothing',
    async (from, to) => {
      useRepo({ id: 5, status: from });
      const allowed = ALLOWED[from].join(', ') || 'none';

      await expect(updateTaskStatus('5', to)).rejects.toThrow(
        new ValidationError(`Invalid status transition from ${from} to ${to}. Allowed: ${allowed}`)
      );
      expect(taskRepo.updateStatus).not.toHaveBeenCalled();
    }
  );

  it('treats an unknown stored status as a dead end (no transitions)', async () => {
    useRepo({ id: 5, status: 'ARCHIVED' }); // e.g. a row written by another tool
    await expect(updateTaskStatus('5', 'DONE')).rejects.toThrow(
      'Invalid status transition from ARCHIVED to DONE. Allowed: none'
    );
    expect(taskRepo.updateStatus).not.toHaveBeenCalled();
  });

  it.each([['FINISHED'], ['todo'], [''], [undefined], [null]])(
    'rejects status value %p before touching the repository',
    async (status) => {
      useRepo({ id: 5, status: 'TODO' });
      await expect(updateTaskStatus('5', status)).rejects.toThrow(
        new ValidationError(`Invalid status: ${status}. Allowed values: TODO, IN_PROGRESS, DONE`)
      );
      expect(taskRepo.findById).not.toHaveBeenCalled();
    }
  );

  it('returns 404 NotFoundError when the task does not exist', async () => {
    useRepo(null);
    const err = await updateTaskStatus('99', 'IN_PROGRESS').catch((e) => e);

    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Task with id 99 not found');
    expect(taskRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('validates the id before anything else', async () => {
    useRepo({ id: 5, status: 'TODO' });
    await expect(updateTaskStatus('abc', 'IN_PROGRESS')).rejects.toThrow(
      'Invalid task id "abc": must be a positive integer'
    );
    expect(taskRepo.findById).not.toHaveBeenCalled();
  });
});
