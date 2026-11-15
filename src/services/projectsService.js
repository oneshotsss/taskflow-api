const { ValidationError, NotFoundError } = require('../errors/AppError');
const { getRepositories } = require('../repositories');
const { parseId, parseOptionalRef, requireText } = require('./validation');

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

  const { projectRepo } = getRepositories();
  return await projectRepo.createWithTasks({
    name: cleanName,
    userId: cleanUserId,
    initialTasks: cleanTasks,
  });
};

const getProjects = async () => {
  const { projectRepo } = getRepositories();
  return await projectRepo.findAllWithTasks();
};

const getProjectById = async (rawId) => {
  const id = parseId(rawId, 'project');
  const { projectRepo } = getRepositories();
  const project = await projectRepo.findByIdWithTasks(id);
  if (!project) throw new NotFoundError(`Project with id ${id} not found`);
  return project;
};

const deleteProject = async (rawId) => {
  const id = parseId(rawId, 'project');
  const { projectRepo } = getRepositories();
  const result = await projectRepo.deleteWithTasks(id);
  if (!result) {
    throw new NotFoundError(`Project with id ${id} not found`);
  }
  return result;
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
};
