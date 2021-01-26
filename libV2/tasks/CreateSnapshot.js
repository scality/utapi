const BaseTask = require('./BaseTask');
const config = require('../config');
const { snapshotLagSecs } = require('../constants');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'CreateSnapshot',
});

class CreateSnapshot extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.snapshotSchedule;
        this._defaultLag = snapshotLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('creating snapshots', { snapshotTimestamp: timestamp });

        const status = await this.withWarp10(async warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                },
                macro: 'utapi/createSnapshot',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0]} snapshots`);
        }
    }
}

module.exports = CreateSnapshot;
