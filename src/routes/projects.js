const express = require('express');
const {
  handleCreateProject,
  handleGetProjects,
  handleGetProjectById,
  handleDeleteProject,
} = require('../controllers/projectsController');

const router = express.Router();

router.post('/', handleCreateProject);
router.get('/', handleGetProjects);
router.get('/:id', handleGetProjectById);
router.delete('/:id', handleDeleteProject);

module.exports = router;
