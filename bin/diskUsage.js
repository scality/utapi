const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'MonitorDiskUsage',
});


const task = new tasks.MonitorDiskUsage({ warp10: [warp10Clients[0]] });

task.setup()
    .then(() => logger.info('Starting disk usage monitor'))
    .then(() => task.start())
    .then(() => logger.info('Disk usage monitor started'));
