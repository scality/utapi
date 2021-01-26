const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'CreateCheckpoint',
});


const task = new tasks.CreateCheckpoint({ warp10: [warp10Clients[0]] });

task.setup()
    .then(() => logger.info('Starting checkpoint creation'))
    .then(() => task.start())
    .then(() => logger.info('Checkpoint creation started'));
