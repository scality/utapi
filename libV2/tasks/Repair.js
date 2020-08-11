const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext } = require('..//utils');
const { repairLagSecs, indexedEventFields } = require('../constants');

const logger = new LoggerContext({
    module: 'Repair',
});

class RepairTask extends BaseTask {
    constructor(options) {
        super({
            warp10: {
                requestTimeout: 30000,
                connectTimeout: 30000,
            },
            ...options,
        });
        this._defaultSchedule = config.repairSchedule;
        this._defaultLag = repairLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('Checking for repairs', { timestamp, nodeId: this.nodeId });

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

module.exports = RepairTask;
