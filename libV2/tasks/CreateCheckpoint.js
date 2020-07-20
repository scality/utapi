const BaseTask = require('./BaseTask');
const config = require('../config');
const { checkpointLagSecs, indexedEventFields } = require('../constants');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'IngestShard',
});

class CreateCheckpoint extends BaseTask {
    constructor(...options) {
        super({
            warp10: {
                requestTimeout: 30000,
                connectTimeout: 30000,
            },
            ...options,
        });
        this._defaultSchedule = config.checkpointSchedule;
        this._defaultLag = checkpointLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('creating checkpoints', { checkpointTimestamp: timestamp });

        const params = {
            params: {
                nodeId: config.nodeId,
                end: timestamp.toString(),
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
