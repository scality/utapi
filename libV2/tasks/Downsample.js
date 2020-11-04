const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext } = require('../utils');
const { downsampleLagSecs, indexedEventFields } = require('../constants');

const logger = new LoggerContext({
    module: 'Repair',
});

class DownsampleTask extends BaseTask {
    constructor(options) {
        super({
            warp10: {
                requestTimeout: 30000,
                connectTimeout: 30000,
            },
            ...options,
        });
        this._defaultSchedule = config.downsampleSchedule;
        this._defaultLag = downsampleLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('Downsampling records', { timestamp, nodeId: this.nodeId });

        const params = {
            params: {
                nodeId: this.nodeId,
                end: timestamp.toString(),
                fields: indexedEventFields,
            },
            macro: 'utapi/repairRecords',
        };
        const status = await this._warp10.exec(params);
        if (status.result[0]) {
            logger.info(`created ${status.result[0]} corrections`);
        }
    }
}

module.exports = DownsampleTask;
