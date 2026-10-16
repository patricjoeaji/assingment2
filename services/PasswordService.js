const bcrypt = require('bcryptjs');

class PasswordService {
  hash(password) {
    return bcrypt.hash(password, 10);
  }
}

module.exports = PasswordService;
