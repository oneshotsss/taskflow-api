const express = require('express');
const { getTasks, createTask, handleUpdateStatus } = require('../controllers/tasksController');

const router = express.Router();

router.get('/', getTasks);
router.post('/', createTask);
router.patch('/:id/status', handleUpdateStatus);

module.exports = router;
