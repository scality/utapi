const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const config = require('../libV2/config');

const logger = new LoggerContext({
    task: 'Repair',
});

const taskConfig = config.merge({
    warp10: {
        hosts: config.warp10.hosts[0],
    },
});

const task = new tasks.RepairTask(taskConfig);

task.setup()
    .then(() => logger.info('Starting Repair daemon'))
    .then(() => task.start())
    .then(() => logger.info('Repair started'));
