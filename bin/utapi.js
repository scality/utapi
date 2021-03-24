#!/usr/bin/env node
const Process = require('../libV2/process');

const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({ module: 'entrypoint' });

const utapiProcess = new Process();

utapiProcess.setup().then(
    () => {
        logger.info('Utapi setup completed, starting...');
        return utapiProcess.start();
    },
    async error => {
        logger.error(`Utapi encountered an unexpected error during setup ${ error.message }`, );
        await utapiProcess.join(1);
    },
).then(
    () => logger.info('Utapi started'),
    async error => {
        logger.error(`Utapi encountered an error during startup: ${error.message}`);
        await utapiProcess.join(1);
    },
);
