const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'Repair',
});


const task = new tasks.RepairTask({ warp10: [warp10Clients[0]] });

task.setup()
    .then(() => logger.info('Starting Repair daemon'))
    .then(() => task.start())
    .then(() => logger.info('Repair started'));
