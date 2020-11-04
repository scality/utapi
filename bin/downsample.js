const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'Downsample',
});


const task = new tasks.DownsampleTask();

task.setup()
    .then(() => logger.info('Starting Downsample daemon'))
    .then(() => task.start())
    .then(() => logger.info('Downsample started'));
