const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'ManualAdjust',
});


const task = new tasks.ManualAdjust({ warp10: warp10Clients });

task.setup()
    .then(() => logger.info('Starting manual adjustment'))
    .then(() => task.start())
    .then(() => logger.info('Manual adjustment started'));
