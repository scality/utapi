const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext, getFolderSize, formatDiskSize } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'MonitorDiskUsage',
    path: config.diskUsage.path,
});

class MonitorDiskUsage extends BaseTask {
    constructor(options) {
        super(
            options,
        );
        this._defaultSchedule = config.diskUsageSchedule;
        this._defaultLag = 0;
        this._path = config.diskUsage.path;
        this._enabled = config.diskUsage.enabled;
    }

    _getUsage() {
        moduleLogger.debug(`calculating disk usage for ${this._path}`);
        return getFolderSize(this._path);
    }

    // eslint-disable-next-line class-methods-use-this
    async _execute() {
        if (!this._enabled) {
            moduleLogger.debug('disk usage monitoring not enabled, skipping check');
            return;
        }

        let size;
        try {
            size = await this._getUsage();
        } catch (error) {
            moduleLogger.error(`error calculating disk usage for ${this._path}`, { error });
            return;
        }

        moduleLogger.debug(`using ${formatDiskSize(size)}`, { usage: size });
    }
}

module.exports = MonitorDiskUsage;
