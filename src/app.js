const { execSync } = require('child_process');
const express = require('express');
const tasksRouter = require('./routes/tasks');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.get('/version', (req, res) => {
  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // git not available or not a repo — keep "unknown"
  }
  res.status(200).json({ version: sha });
});

app.use('/tasks', tasksRouter);

module.exports = app;
