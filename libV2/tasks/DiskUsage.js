const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'MonitorDiskUsage',
});

class MonitorDiskUsage extends BaseTask {
    constructor(options) {
        super(
            options,
        );
        this._defaultSchedule = config.diskUsageSchedule;
        this._defaultLag = 0;
    }

    async _execute(timestamp) {
        logger.debug('checking disk usage', { config.diskUsage.monitored_path });

        const params = {
            params: {
                nodeId: this.nodeId,
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

module.exports = MonitorDiskUsage;
