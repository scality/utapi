const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'Migrate',
});
