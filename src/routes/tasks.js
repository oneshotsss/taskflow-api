const express = require('express');
const logger = require('../utils/logger');
const { getTasks, createTask, handleUpdateStatus } = require('../controllers/tasksController');

const router = express.Router();

router.use((req, res, next) => {
  logger.debug(`[route] /tasks ${req.method} ${req.path}`);
  next();
});

router.get('/', getTasks);
router.post('/', createTask);
router.patch('/:id/status', handleUpdateStatus);

module.exports = router;
