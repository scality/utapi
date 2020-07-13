const BaseTask = require('./BaseTask');
const config = require('../config');
const { snapshotLagSecs } = require('../constants');
const { LoggerContext } = require('../utils');
const Warp10Client = require('../warp10');

const logger = new LoggerContext({
    module: 'CreateSnapshot',
});

class CreateSnapshot extends BaseTask {
    constructor(...options) {
        super(...options);
        this._warp10 = new Warp10Client({ requestTimeout: 30000, connectTimeout: 30000 });
        this._defaultSchedule = config.snapshotSchedule;
    }

    async _execute(timestamp) {
        const snapshotTimestamp = timestamp - (snapshotLagSecs * 1000000);
        logger.debug('creating snapshots', { snapshotTimestamp });

        const params = {
            params: {
                nodeId: config.nodeId,
                end: snapshotTimestamp.toString(),
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
