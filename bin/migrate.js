const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');

const logger = new LoggerContext({
    task: 'Migrate',
});

const task = new tasks.MigrateTask();

task.setup()
    .then(() => logger.info('Starting utapi v1 => v2 migration'))
    .then(() => task.start())
    .then(() => logger.info('Migration started'));
