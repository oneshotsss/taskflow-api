const logger = require('../../utils/logger');
class InMemoryTaskRepository {
  constructor() {
    this.tasks = [];
    this.nextId = 1;
  }

  async create({ title, projectId, status = 'TODO' }) {
    logger.debug('[memory] task.create');
    const task = {
      id: this.nextId++,
      title,
      status,
      projectId: projectId != null ? Number(projectId) : null,
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    return { ...task };
  }

  async findById(id) {
    logger.debug('[memory] task.findById');
    const task = this.tasks.find((t) => t.id === Number(id));
    return task ? { ...task } : null;
  }

  async findByProjectId(projectId) {
    logger.debug('[memory] task.findByProjectId');
    return this.tasks.filter((t) => t.projectId === Number(projectId)).map((t) => ({ ...t }));
  }

  async findAll() {
    logger.debug('[memory] task.findAll');
    return this.tasks.map((t) => ({ ...t }));
  }

  async updateStatus(id, newStatus) {
    logger.debug('[memory] task.updateStatus');
    const task = this.tasks.find((t) => t.id === Number(id));
    if (!task) return null;
    task.status = newStatus;
    return { ...task };
  }

  async deleteByProjectId(projectId) {
    logger.debug('[memory] task.deleteByProjectId');
    const initialLen = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.projectId !== Number(projectId));
    return initialLen - this.tasks.length;
  }

  async reset() {
    logger.debug('[memory] task.reset');
    this.tasks = [];
    this.nextId = 1;
  }
}

module.exports = new InMemoryTaskRepository();
