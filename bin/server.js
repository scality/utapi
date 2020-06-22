const { startServer } = require('..');
const { logger } = require('../libV2/utils');

startServer().then(() => logger.info('utapi started'))//, err => logger.error('Unhandled Error', { err: error.message }));
