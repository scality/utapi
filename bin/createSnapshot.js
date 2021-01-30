const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'CreateSnapshot',
});

const task = new tasks.CreateSnapshot({ warp10: [warp10Clients[0]] });

task.setup()
    .then(() => logger.info('Starting snapshot creation'))
    .then(() => task.start())
    .then(() => logger.info('Snapshot creation started'));
