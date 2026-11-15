const { ValidationError, NotFoundError } = require('../errors/AppError');
const { getRepositories } = require('../repositories');
const { parseId, parseOptionalRef, requireText } = require('./validation');
const logger = require('../utils/logger');

const createProject = async ({ name, userId, initialTasks = [] }) => {
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

  logger.info(`[service] createProject: "${cleanName}" with ${cleanTasks.length} initial task(s)`);
  const { projectRepo } = getRepositories();
  const project = await projectRepo.createWithTasks({
    name: cleanName,
    userId: cleanUserId,
    initialTasks: cleanTasks,
  });
  logger.info(`[service] createProject: created project ${project.id}`);
  return project;
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
