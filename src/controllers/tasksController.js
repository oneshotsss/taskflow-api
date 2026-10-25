const { fetchAllTasks, addTask, updateTaskStatus } = require('../services/tasksService');

const getTasks = async (req, res) => {
  const tasks = await fetchAllTasks();
  res.json(tasks);
};

const createTask = async (req, res) => {
  const { title, projectId } = req.body;
  const newTask = await addTask({ title, projectId });
  res.status(201).json(newTask);
};

const handleUpdateStatus = async (req, res) => {
  const { status } = req.body;
  const updated = await updateTaskStatus(req.params.id, status);
  res.status(200).json(updated);
};

module.exports = {
  getTasks,
  createTask,
  handleUpdateStatus,
};
