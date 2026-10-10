const { fetchAllTasks, addTask } = require('../services/tasksService');

const getTasks = (req, res) => {
  const tasks = fetchAllTasks();
  res.json(tasks);
};

const createTask = (req, res) => {
  const { title, projectId } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const newTask = addTask({ title, projectId });
  res.status(201).json(newTask);
};

module.exports = {
  getTasks,
  createTask,
};
