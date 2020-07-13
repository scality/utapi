const BaseTask = require('./BaseTask');
const config = require('../config');
const { checkpointLagSecs, indexedEventFields } = require('../constants');
const { LoggerContext } = require('../utils');
const Warp10Client = require('../warp10');

const logger = new LoggerContext({
    module: 'IngestShard',
});

class CreateCheckpoint extends BaseTask {
    constructor(...options) {
        super(...options);
        this._warp10 = new Warp10Client({ requestTimeout: 30000, connectTimeout: 30000 });
        this._defaultSchedule = config.checkpointSchedule;
    }

    async _execute(timestamp) {
        const checkpointTimestamp = timestamp - (checkpointLagSecs * 1000000);
        logger.debug('creating checkpoints', { checkpointTimestamp });

        const params = {
            params: {
                nodeId: config.nodeId,
                end: checkpointTimestamp.toString(),
                fields: indexedEventFields,
            },
            macro: 'utapi/createCheckpoint',
        };
        const status = await this._warp10.exec(params);
        if (status.result[0]) {
            logger.info(`created ${status.result[0] || 0} checkpoints`);
        }
    }
}

module.exports = CreateCheckpoint;
