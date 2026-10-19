const UserRepository = require('../repositories/UserRepository');
const PasswordService = require('./PasswordService');

class AccountManagementService {
  constructor() {
    // Created and owned collaborators provide composition evidence.
    this.users = new UserRepository();
    this.passwords = new PasswordService();
  }

  async findAccount(id) {
    const user = await this.users.findAccount(id);
    if (!user) {
      const error = new Error('Account not found.');
      error.status = 404;
      throw error;
    }
    return user;
  }

  async updateProfile(id, details) {
    const name = String(details.name || '').trim();
    const phone = String(details.phone || '').trim();
    const email = String(details.email || '').trim().toLowerCase();
    if (!name || !email) throw new Error('Name and email are required.');
    const user = await this.findAccount(id);
    user.name = name;
    user.phone = phone;
    user.email = email;
    await this.users.saveAccount(user);
    return user;
  }

  async changePassword(id, details) {
    const currentPassword = String(details.currentPassword || '');
    const newPassword = String(details.newPassword || '');
    if (!currentPassword || newPassword.length < 8) {
      throw new Error('Enter your current password and a new password of at least 8 characters.');
    }
    const user = await this.findAccount(id);
    if (!await this.passwords.compare(currentPassword, user.password)) {
      const error = new Error('Current password is incorrect.');
      error.status = 401;
      throw error;
    }
    user.password = await this.passwords.hash(newPassword);
    await this.users.saveAccount(user);
  }
}

module.exports = AccountManagementService;
