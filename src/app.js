const { execSync } = require('child_process');
const express = require('express');
const contextMiddleware = require('./middleware/contextMiddleware');
const requestLogger = require('./middleware/requestLogger');
const tasksRouter = require('./routes/tasks');
const projectsRouter = require('./routes/projects');
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./errors/AppError');

const app = express();

// 1. Context propagation via AsyncLocalStorage
app.use(contextMiddleware);
app.use(requestLogger);

// 2. Request body parsing
app.use(express.json());

// 3. Infrastructure endpoints
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

// 4. Domain routes
app.use('/tasks', tasksRouter);
app.use('/projects', projectsRouter);

// 5. Unknown routes get the same JSON error contract instead of Express's HTML page
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// 6. Global unified error handler
app.use(errorHandler);

module.exports = app;
