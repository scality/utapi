const BaseTask = require('./BaseTask');
const config = require('../config');
const { snapshotLagSecs } = require('../constants');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'CreateSnapshot',
});

class CreateSnapshot extends BaseTask {
    constructor(...options) {
        super({
            warp10: {
                requestTimeout: 30000,
                connectTimeout: 30000,
            },
            ...options,
        });
        this._defaultSchedule = config.snapshotSchedule;
        this._defaultLag = snapshotLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('creating snapshots', { snapshotTimestamp: timestamp });

        const params = {
            params: {
                nodeId: config.nodeId,
                end: timestamp.toString(),
            },
            macro: 'utapi/createSnapshot',
        };
        const status = await this._warp10.exec(params);
        if (status.result[0]) {
            logger.info(`created ${status.result[0]} snapshots`);
        }
    }
}

module.exports = CreateSnapshot;
