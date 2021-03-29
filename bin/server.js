const { startUtapiServer } = require('..');
const { LoggerContext } = require('../libV2/utils');
const config = require('../libV2/config');

const logger = new LoggerContext({ module: 'entrypoint' });

startUtapiServer(config).then(
    () => logger.info('utapi started'),
    error => logger.error('Unhandled Error', { error }),
);
