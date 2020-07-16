const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'CreateCheckpoint',
});


const task = new tasks.CreateCheckpoint();

task.setup()
    .then(() => logger.info('Starting checkpoint creation'))
    .then(() => task.start())
    .then(() => logger.info('Checkpoint creation started'));
