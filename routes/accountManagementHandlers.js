function createProfileHandler(accounts, toPublicUser) {
  return async (req, res) => {
    try {
      const user = await accounts.updateProfile(req.params.id, req.body);
      res.json({ message: 'Profile updated.', user: toPublicUser(user) });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'That email is already in use.' });
      res.status(error.status === 404 ? 404 : 400).json({ message: error.message });
    }
  };
}

function createPasswordHandler(accounts) {
  return async (req, res) => {
    try {
      await accounts.changePassword(req.params.id, req.body);
      res.json({ message: 'Password updated.' });
    } catch (error) {
      res.status([401, 404].includes(error.status) ? error.status : 400).json({ message: error.message });
    }
  };
}

module.exports = { createProfileHandler, createPasswordHandler };
