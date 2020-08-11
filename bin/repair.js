const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'Repair',
});


const task = new tasks.RepairTask();

task.setup()
    .then(() => logger.info('Starting Repair daemon'))
    .then(() => task.start())
    .then(() => logger.info('Repair started'));
