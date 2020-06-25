const { startServer } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({ module: 'entrypoint' });

startServer().then(
    () => logger.info('utapi started'),
    error => logger.error('Unhandled Error', { error }),
);
