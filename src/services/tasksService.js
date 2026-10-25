const { ValidationError, NotFoundError } = require('../errors/AppError');
let taskRepo = require('../repositories/inMemory/inMemoryTaskRepository');

const setTaskRepository = (customTaskRepo) => {
  if (customTaskRepo) taskRepo = customTaskRepo;
};

const ALLOWED_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

const VALID_TRANSITIONS = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE', 'TODO'],
  DONE: [],
};

const fetchAllTasks = async () => {
  return await taskRepo.findAll();
};

const addTask = async ({ title, projectId }) => {
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new ValidationError('Task title is required and cannot be empty');
  }
  return await taskRepo.create({
    title: title.trim(),
    projectId,
    status: 'TODO',
  });
};

const updateTaskStatus = async (id, newStatus) => {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status: ${newStatus}. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
    );
  }

  const existingTask = await taskRepo.findById(id);
  if (!existingTask) {
    throw new NotFoundError(`Task with id ${id} not found`);
  }

  const allowedNext = VALID_TRANSITIONS[existingTask.status] || [];
  if (!allowedNext.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status transition from ${existingTask.status} to ${newStatus}. Allowed: ${allowedNext.join(', ') || 'none'}`
    );
  }

  return await taskRepo.updateStatus(id, newStatus);
};

module.exports = {
  fetchAllTasks,
  addTask,
  updateTaskStatus,
  setTaskRepository,
};
