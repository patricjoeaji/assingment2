const User = require('../models/User');

class UserRepository {
  findAccount(id) { return User.findById(id); }
  saveAccount(account) { return account.save(); }

  updateWorkerStatus(id, isActive) {
    return User.findOneAndUpdate(
      { _id: id, role: 'Worker' },
      { isActive },
      { new: true, runValidators: true }
    );
  }

  createWorker(details) {
    return User.create({
      ...details,
      role: 'Worker',
      isActive: true
    });
  }
}

module.exports = UserRepository;
