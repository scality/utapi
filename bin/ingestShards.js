const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const config = require('../libV2/config');

const logger = new LoggerContext({
    task: 'IngestShard',
});

const task = new tasks.IngestShard(config);

task.setup()
    .then(() => logger.info('Starting shard ingestion'))
    .then(() => task.start())
    .then(() => logger.info('Ingestion started'));
