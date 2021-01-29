const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const { clients: warp10Clients } = require('../libV2/warp10');

const logger = new LoggerContext({
    task: 'Migrate',
});

const task = new tasks.MigrateTask({ warp10: [warp10Clients[0]] });

task.setup()
    .then(() => logger.info('Starting utapi v1 => v2 migration'))
    .then(() => task.start())
    .then(() => logger.info('Migration started'));
