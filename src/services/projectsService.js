const { ValidationError, NotFoundError } = require('../errors/AppError');
let projectRepo = require('../repositories/inMemory/inMemoryProjectRepository');
let taskRepo = require('../repositories/inMemory/inMemoryTaskRepository');

const setRepositories = (customProjectRepo, customTaskRepo) => {
  if (customProjectRepo) projectRepo = customProjectRepo;
  if (customTaskRepo) taskRepo = customTaskRepo;
};

const createProject = async ({ name, userId, initialTasks = [] }) => {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new ValidationError('Project name is required and cannot be empty');
  }

  // Validate tasks beforehand
  if (Array.isArray(initialTasks)) {
    for (const task of initialTasks) {
      if (!task.title || typeof task.title !== 'string' || task.title.trim() === '') {
        throw new ValidationError('Every initial task must have a non-empty title');
      }
    }
  }

  // Call repository to create project & tasks (in-memory or transactional SQL)
  if (typeof projectRepo.createWithTasks === 'function') {
    return await projectRepo.createWithTasks({ name: name.trim(), userId, initialTasks });
  }

  const project = await projectRepo.create({ name: name.trim(), userId });
  const tasks = [];
  try {
    for (const t of initialTasks) {
      const createdTask = await taskRepo.create({
        title: t.title.trim(),
        projectId: project.id,
      });
      tasks.push(createdTask);
    }
  } catch (err) {
    // Rollback for in-memory
    await projectRepo.delete(project.id);
    await taskRepo.deleteByProjectId(project.id);
    throw err;
  }

  return { ...project, tasks };
};

const getProjects = async () => {
  if (typeof projectRepo.findAllWithTasks === 'function') {
    return await projectRepo.findAllWithTasks();
  }
  const projects = await projectRepo.findAll();
  const tasks = await taskRepo.findAll();
  return projects.map((p) => ({
    ...p,
    tasks: tasks.filter((t) => t.projectId === p.id),
  }));
};

const getProjectById = async (id) => {
  if (typeof projectRepo.findByIdWithTasks === 'function') {
    const project = await projectRepo.findByIdWithTasks(id);
    if (!project) throw new NotFoundError(`Project with id ${id} not found`);
    return project;
  }
  const project = await projectRepo.findById(id);
  if (!project) {
    throw new NotFoundError(`Project with id ${id} not found`);
  }
  const tasks = await taskRepo.findByProjectId(id);
  return { ...project, tasks };
};

const deleteProject = async (id) => {
  const existing = await projectRepo.findById(id);
  if (!existing) {
    throw new NotFoundError(`Project with id ${id} not found`);
  }
  await taskRepo.deleteByProjectId(id);
  await projectRepo.delete(id);
  return true;
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
  setRepositories,
};
