function createWorkerHandler(workerCreation, toPublicUser) {
  return async (req, res) => {
    try {
      const worker = await workerCreation.createWorker(req.body);
      res.status(201).json({
        message: 'Worker added.',
        worker: toPublicUser(worker)
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: 'That email is already in use.' });
      }

      res.status(400).json({ message: error.message });
    }
  };
}

module.exports = createWorkerHandler;
