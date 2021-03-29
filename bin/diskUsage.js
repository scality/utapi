const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const config = require('../libV2/config');

const logger = new LoggerContext({
    task: 'MonitorDiskUsage',
});

const taskConfig = config.merge({
    warp10: {
        hosts: config.warp10.hosts[0],
    },
});


const task = new tasks.MonitorDiskUsage(taskConfig);

task.setup()
    .then(() => logger.info('Starting disk usage monitor'))
    .then(() => task.start())
    .then(() => logger.info('Disk usage monitor started'));
