const { ValidationError, NotFoundError } = require('../errors/AppError');
const { getRepositories } = require('../repositories');

const createProject = async ({ name, userId, initialTasks = [] }) => {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new ValidationError('Project name is required and cannot be empty');
  }

  if (Array.isArray(initialTasks)) {
    for (const task of initialTasks) {
      if (!task.title || typeof task.title !== 'string' || task.title.trim() === '') {
        throw new ValidationError('Every initial task must have a non-empty title');
      }
    }
  }

  const { projectRepo } = getRepositories();
  return await projectRepo.createWithTasks({
    name: name.trim(),
    userId,
    initialTasks: initialTasks.map((t) => ({ title: t.title.trim() })),
  });
};

const getProjects = async () => {
  const { projectRepo } = getRepositories();
  return await projectRepo.findAllWithTasks();
};

const getProjectById = async (id) => {
  const { projectRepo } = getRepositories();
  const project = await projectRepo.findByIdWithTasks(id);
  if (!project) throw new NotFoundError(`Project with id ${id} not found`);
  return project;
};

const deleteProject = async (id) => {
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
