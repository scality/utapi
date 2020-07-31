const { startUtapiServer } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({ module: 'entrypoint' });

startUtapiServer().then(
    () => logger.info('utapi started'),
    error => logger.error('Unhandled Error', { error }),
);
