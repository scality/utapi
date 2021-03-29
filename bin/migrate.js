const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const config = require('../libV2/config');

const logger = new LoggerContext({
    task: 'Migrate',
});

const taskConfig = config.merge({
    warp10: {
        hosts: config.warp10.hosts[0],
    },
});

const task = new tasks.MigrateTask(taskConfig);

task.setup()
    .then(() => logger.info('Starting utapi v1 => v2 migration'))
    .then(() => task.start())
    .then(() => logger.info('Migration started'));
