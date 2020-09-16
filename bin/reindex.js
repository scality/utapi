const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'Reindex',
});


const task = new tasks.ReindexTask();

task.setup()
    .then(() => logger.info('Starting Reindex daemon'))
    .then(() => task.start())
    .then(() => logger.info('Reindex started'));
