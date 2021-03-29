const { tasks } = require('..');
const { LoggerContext } = require('../libV2/utils');
const config = require('../libV2/config');

const logger = new LoggerContext({
    task: 'ManualAdjust',
});

const task = new tasks.ManualAdjust(config);

task.setup()
    .then(() => logger.info('Starting manual adjustment'))
    .then(() => task.start())
    .then(() => logger.info('Manual adjustment started'));
