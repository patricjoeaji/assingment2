const UserRepository = require('../repositories/UserRepository');
const PasswordService = require('./PasswordService');

class WorkerCreationService {
  constructor() {
    // These collaborators are created and owned by this service.
    this.users = new UserRepository();
    this.passwords = new PasswordService();
  }

  async createWorker(details) {
    const name = String(details.name || '').trim();
    const phone = String(details.phone || '').trim();
    const email = String(details.email || '').trim().toLowerCase();
    const password = String(details.password || '');

    if (!name || !email || !phone || password.length < 8) {
      throw new Error(
        'Name, email, phone, and a password of at least 8 characters are required.'
      );
    }

    const passwordHash = await this.passwords.hash(password);
    return this.users.createWorker({ name, phone, email, password: passwordHash });
  }
}

module.exports = WorkerCreationService;
