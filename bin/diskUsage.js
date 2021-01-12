const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'MonitorDiskUsage',
});


const task = new tasks.MonitorDiskUsage();

task.setup()
    .then(() => logger.info('Starting disk usage monitor'))
    .then(() => task.start())
    .then(() => logger.info('Disk usage monitor started'));
