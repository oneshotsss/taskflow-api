const { ValidationError, NotFoundError } = require('../errors/AppError');
const { getRepositories } = require('../repositories');
const { parseId, parseOptionalRef, requireText } = require('./validation');

const ALLOWED_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

const VALID_TRANSITIONS = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE', 'TODO'],
  DONE: [],
};

const fetchAllTasks = async () => {
  const { taskRepo } = getRepositories();
  return await taskRepo.findAll();
};

const addTask = async ({ title, projectId }) => {
  const cleanTitle = requireText(title, 'Task title');
  const cleanProjectId = parseOptionalRef(projectId, 'projectId');
  const { taskRepo } = getRepositories();
  return await taskRepo.create({
    title: cleanTitle,
    projectId: cleanProjectId,
    status: 'TODO',
  });
};

const updateTaskStatus = async (rawId, newStatus) => {
  const id = parseId(rawId, 'task');
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status: ${newStatus}. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
    );
  }

  const { taskRepo } = getRepositories();
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
};
