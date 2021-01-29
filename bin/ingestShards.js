const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'IngestShard',
});


const task = new tasks.IngestShard({ warp10: warp10Clients });

task.setup()
    .then(() => logger.info('Starting shard ingestion'))
    .then(() => task.start())
    .then(() => logger.info('Ingestion started'));
