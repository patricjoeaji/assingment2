const bcrypt = require('bcryptjs');

class PasswordService {
  compare(password, hash) { return bcrypt.compare(password, hash); }

  hash(password) {
    return bcrypt.hash(password, 10);
  }
}

module.exports = PasswordService;
