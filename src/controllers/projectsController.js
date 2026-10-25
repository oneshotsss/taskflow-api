const {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
} = require('../services/projectsService');

const handleCreateProject = async (req, res) => {
  const { name, userId, initialTasks } = req.body;
  const project = await createProject({ name, userId, initialTasks });
  res.status(201).json(project);
};

const handleGetProjects = async (req, res) => {
  const projects = await getProjects();
  res.status(200).json(projects);
};

const handleGetProjectById = async (req, res) => {
  const project = await getProjectById(req.params.id);
  res.status(200).json(project);
};

const handleDeleteProject = async (req, res) => {
  await deleteProject(req.params.id);
  res.status(204).send();
};

module.exports = {
  handleCreateProject,
  handleGetProjects,
  handleGetProjectById,
  handleDeleteProject,
};
