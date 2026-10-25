class InMemoryTaskRepository {
  constructor() {
    this.tasks = [];
    this.nextId = 1;
  }

  async create({ title, projectId, status = 'TODO' }) {
    const task = {
      id: this.nextId++,
      title,
      status,
      projectId: projectId !== undefined ? Number(projectId) : null,
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    return { ...task };
  }

  async findById(id) {
    const task = this.tasks.find((t) => t.id === Number(id));
    return task ? { ...task } : null;
  }

  async findByProjectId(projectId) {
    return this.tasks.filter((t) => t.projectId === Number(projectId)).map((t) => ({ ...t }));
  }

  async findAll() {
    return this.tasks.map((t) => ({ ...t }));
  }

  async updateStatus(id, newStatus) {
    const task = this.tasks.find((t) => t.id === Number(id));
    if (!task) return null;
    task.status = newStatus;
    return { ...task };
  }

  async deleteByProjectId(projectId) {
    const initialLen = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.projectId !== Number(projectId));
    return initialLen - this.tasks.length;
  }

  async reset() {
    this.tasks = [];
    this.nextId = 1;
  }
}

module.exports = new InMemoryTaskRepository();
