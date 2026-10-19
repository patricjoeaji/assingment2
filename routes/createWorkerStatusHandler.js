function createWorkerStatusHandler(workerStatus, toPublicUser) {
  return async (req, res) => {
    try {
      const worker = await workerStatus.setActive(req.params.id, req.body.isActive);
      res.json({
        message: req.body.isActive ? 'Worker activated.' : 'Worker deactivated.',
        worker: toPublicUser(worker)
      });
    } catch (error) {
      res.status(error.status === 404 ? 404 : 400).json({ message: error.message });
    }
  };
}

module.exports = createWorkerStatusHandler;
