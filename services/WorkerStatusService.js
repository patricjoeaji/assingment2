const UserRepository = require('../repositories/UserRepository');

class WorkerStatusService {
  constructor() {
    // The service creates and owns its repository collaborator (composition).
    this.users = new UserRepository();
  }

  async setActive(id, isActive) {
    if (typeof isActive !== 'boolean') {
      throw new Error('A worker status is required.');
    }
    const worker = await this.users.updateWorkerStatus(id, isActive);
    if (!worker) {
      const error = new Error('Worker not found.');
      error.status = 404;
      throw error;
    }
    return worker;
  }
}

module.exports = WorkerStatusService;
