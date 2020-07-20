const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'CreateSnapshot',
});


const task = new tasks.CreateSnapshot();

task.setup()
    .then(() => logger.info('Starting snapshot creation'))
    .then(() => task.start())
    .then(() => logger.info('Snapshot creation started'));
