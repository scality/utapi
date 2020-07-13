const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'IngestShard',
});


const task = new tasks.IngestShard();

task.setup()
    .then(() => logger.info('Starting shard ingestion'))
    .then(() => task.start())
    .then(() => logger.info('Ingestion started'));
