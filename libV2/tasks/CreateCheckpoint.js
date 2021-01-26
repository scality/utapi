const BaseTask = require('./BaseTask');
const config = require('../config');
const { checkpointLagSecs, indexedEventFields } = require('../constants');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'CreateCheckpoint',
});

class CreateCheckpoint extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.checkpointSchedule;
        this._defaultLag = checkpointLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('creating checkpoints', { checkpointTimestamp: timestamp });
        const status = await this.withWarp10(async warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                    fields: indexedEventFields,
                },
                macro: 'utapi/createCheckpoint',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0] || 0} checkpoints`);
        }
    }
}

module.exports = CreateCheckpoint;
