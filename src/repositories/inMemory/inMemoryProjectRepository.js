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

  async delete(id) {
    const index = this.projects.findIndex((p) => p.id === Number(id));
    if (index === -1) return false;
    this.projects.splice(index, 1);
    return true;
  }

  async reset() {
    this.projects = [];
    this.nextId = 1;
  }
}

module.exports = new InMemoryProjectRepository();
