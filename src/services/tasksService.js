// In-memory model for simplicity
const tasks = [];
let nextId = 1;

const fetchAllTasks = () => {
  return tasks;
};

const addTask = ({ title, projectId }) => {
  const newTask = {
    id: nextId++,
    title,
    status: 'TODO',
    projectId: projectId || null,
  };
  tasks.push(newTask);
  return newTask;
};

module.exports = {
  fetchAllTasks,
  addTask,
};
