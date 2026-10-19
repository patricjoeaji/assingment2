const User = require('../models/User');

class UserRepository {
  createWorker(details) {
    return User.create({
      ...details,
      role: 'Worker',
      isActive: true
    });
  }
}

module.exports = UserRepository;
