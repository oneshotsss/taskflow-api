const crypto = require('node:crypto');
const { ValidationError, NotFoundError } = require('../errors/AppError');
const { getRepositories } = require('../repositories');
const { parseId, parseOptionalRef, requireText } = require('./validation');
const logger = require('../utils/logger');

const IDEMPOTENCY_SCOPE = 'POST /projects';
const IDEMPOTENCY_KEY_PATTERN = /^[!-~]{1,255}$/; // printable ASCII, no spaces

const buildIdempotency = (idempotencyKey, cleanInput) => {
  if (idempotencyKey === undefined) return undefined;
  if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new ValidationError('Idempotency-Key must be 1-255 printable ASCII characters');
  }
  // Hash of the *validated* input: the same logical request always gives the same hash.
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(cleanInput)).digest('hex');
  return { scope: IDEMPOTENCY_SCOPE, key: idempotencyKey, requestHash };
};

// Returns { project, replayed }. replayed=true means the stored response of an
// earlier request with the same Idempotency-Key is returned and nothing was created.
const createProject = async ({ name, userId, initialTasks = [] }, { idempotencyKey } = {}) => {
  const cleanName = requireText(name, 'Project name');
  const cleanUserId = parseOptionalRef(userId, 'userId');

  if (!Array.isArray(initialTasks)) {
    throw new ValidationError('initialTasks must be an array when provided');
  }
  const cleanTasks = initialTasks.map((task, i) => {
    if (!task || typeof task !== 'object') {
      throw new ValidationError(`initialTasks[${i}] must be an object with a title`);
    }
    return { title: requireText(task.title, `initialTasks[${i}].title`) };
  });

  const input = { name: cleanName, userId: cleanUserId, initialTasks: cleanTasks };
  const idempotency = buildIdempotency(idempotencyKey, input);

  logger.info(
    `[service] createProject: "${cleanName}" with ${cleanTasks.length} initial task(s)` +
      (idempotency ? `, Idempotency-Key ${idempotency.key}` : '')
  );
  const { projectRepo } = getRepositories();
  const result = await projectRepo.createWithTasks(input, { idempotency });
  logger.info(
    result.replayed
      ? `[service] createProject: replayed stored response for project ${result.project.id}`
      : `[service] createProject: created project ${result.project.id}`
  );
  return result;
};

const getProjects = async () => {
  const { projectRepo } = getRepositories();
  const projects = await projectRepo.findAllWithTasks();
  logger.info(`[service] getProjects: ${projects.length} project(s)`);
  return projects;
};

const getProjectById = async (rawId) => {
  const id = parseId(rawId, 'project');
  const { projectRepo } = getRepositories();
  const project = await projectRepo.findByIdWithTasks(id);
  if (!project) throw new NotFoundError(`Project with id ${id} not found`);
  logger.info(`[service] getProjectById: project ${id} with ${project.tasks.length} task(s)`);
  return project;
};

const deleteProject = async (rawId) => {
  const id = parseId(rawId, 'project');
  const { projectRepo } = getRepositories();
  const result = await projectRepo.deleteWithTasks(id);
  if (!result) {
    throw new NotFoundError(`Project with id ${id} not found`);
  }
  logger.info(`[service] deleteProject: project ${id} deleted with ${result.deletedTasks} task(s)`);
  return result;
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
};
