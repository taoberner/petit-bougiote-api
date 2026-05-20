const logger = require('../logger');

module.exports = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });
  const status = err.status || 500;
  res.status(status).json({ error: process.env.NODE_ENV === 'production' ? 'Erreur serveur' : err.message });
};
