const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext, getFolderSize, formatDiskSize } = require('../utils');

const moduleLogger = new LoggerContext({
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

    // eslint-disable-next-line class-methods-use-this
    async _execute() {
        if (!config.diskUsage.enabled) {
            moduleLogger.trace('disk usage monitoring not enabled, skipping check');
            return;
        }
        const logger = moduleLogger.with({ path: config.diskUsage.path });

        logger.trace('checking disk usage');
        const size = await getFolderSize(config.diskUsage.path);
        logger.trace(`using ${formatDiskSize(size)}`);
    }
}

module.exports = MonitorDiskUsage;
