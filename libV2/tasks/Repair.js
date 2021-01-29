const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext } = require('../utils');
const { repairLagSecs, indexedEventFields } = require('../constants');

const logger = new LoggerContext({
    module: 'Repair',
});

class RepairTask extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.repairSchedule;
        this._defaultLag = repairLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('Checking for repairs', { timestamp, nodeId: this.nodeId });

        const status = await this.withWarp10(warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                    fields: indexedEventFields,
                },
                macro: 'utapi/repairRecords',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0]} corrections`);
        }
    }
}

module.exports = RepairTask;
