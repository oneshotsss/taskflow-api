const express = require('express');
const logger = require('../utils/logger');
const {
  handleCreateProject,
  handleGetProjects,
  handleGetProjectById,
  handleDeleteProject,
} = require('../controllers/projectsController');

const router = express.Router();

router.use((req, res, next) => {
  logger.debug(`[route] /projects ${req.method} ${req.path}`);
  next();
});

router.post('/', handleCreateProject);
router.get('/', handleGetProjects);
router.get('/:id', handleGetProjectById);
router.delete('/:id', handleDeleteProject);

module.exports = router;
