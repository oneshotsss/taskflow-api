const taskRepo = require('./inMemoryTaskRepository');

// Prototype repository. Exposes the same interface as PostgresProjectRepository
// so services never branch on the storage type.
class InMemoryProjectRepository {
  constructor() {
    this.projects = [];
    this.nextId = 1;
  }

  async create({ name, userId }) {
    const project = {
      id: this.nextId++,
      name,
      userId: userId || null,
      createdAt: new Date().toISOString(),
    };
    this.projects.push(project);
    return { ...project };
  }

  async findById(id) {
    const project = this.projects.find((p) => p.id === Number(id));
    return project ? { ...project } : null;
  }

  async findAll() {
    return this.projects.map((p) => ({ ...p }));
  }

  async findAllWithTasks() {
    const tasks = await taskRepo.findAll();
    return this.projects.map((p) => ({
      ...p,
      tasks: tasks.filter((t) => t.projectId === p.id),
    }));
  }

  async findByIdWithTasks(id) {
    const project = await this.findById(id);
    if (!project) return null;
    return { ...project, tasks: await taskRepo.findByProjectId(id) };
  }

  // No awaits on real I/O between steps, so this is atomic for the
  // single-threaded prototype: either everything is pushed or nothing is.
  async createWithTasks({ name, userId, initialTasks }) {
    const project = await this.create({ name, userId });
    const tasks = [];
    for (const t of initialTasks) {
      tasks.push(await taskRepo.create({ title: t.title, projectId: project.id }));
    }
    return { ...project, tasks };
  }

  async delete(id) {
    const index = this.projects.findIndex((p) => p.id === Number(id));
    if (index === -1) return false;
    this.projects.splice(index, 1);
    return true;
  }

  async deleteWithTasks(id) {
    if (!(await this.findById(id))) return null;
    const deletedTasks = await taskRepo.deleteByProjectId(id);
    await this.delete(id);
    return { deletedTasks };
  }

  async reset() {
    this.projects = [];
    this.nextId = 1;
  }
}

module.exports = new InMemoryProjectRepository();
