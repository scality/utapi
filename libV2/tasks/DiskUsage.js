const async = require('async');
const BaseTask = require('./BaseTask');
const config = require('../config');
const { expirationChunkDuration } = require('../constants');
const {
    LoggerContext, getFolderSize, formatDiskSize, sliceTimeRange,
} = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'MonitorDiskUsage',
    path: config.diskUsage.path,
});

const WARN_THRESHOLD = 0.8;
const ACTION_THRESHOLD = 0.95;

class MonitorDiskUsage extends BaseTask {
    constructor(options) {
        super(
            options,
        );
        this._defaultSchedule = config.diskUsageSchedule;
        this._defaultLag = 0;
        this._path = config.diskUsage.path;
        this._enabled = config.diskUsage.enabled;
        this._expirationEnabled = config.diskUsage.expirationEnabled;
        this._metricRetentionMicroSecs = config.diskUsage.retentionDays * 24 * 60 * 60 * 1000000;
        this._hardLimit = config.diskUsage.hardLimit || null;
    }

    async _setup() {
        await super._setup();
        this._program
            .option('--leader', 'Mark this process as the leader for metric expiration.')
            .option(
                '--lock',
                'Manually trigger a lock of the warp 10 database. This will cause all other options to be ignored.',
            )
            .option(
                '--unlock',
                'Manually trigger an unlock of the warp 10 database. This will cause all other options to be ignored.',
            );
    }

    get isLeader() {
        return this._program.leader !== undefined;
    }

    get isManualUnlock() {
        return this._program.unlock !== undefined;
    }

    get isManualLock() {
        return this._program.lock !== undefined;
    }

    _getUsage() {
        moduleLogger.debug(`calculating disk usage for ${this._path}`);
        return getFolderSize(this._path);
    }

    async _expireMetrics(timestamp) {
        const resp = await this.withWarp10(async warp10 =>
            warp10.exec({
                macro: 'utapi/findOldestRecord',
                params: {
                    class: '~.*',
                    labels: {},
                },
            }));

        if (!resp.result || resp.result.length !== 1) {
            moduleLogger.error('failed to fetch oldest record timestamp. expiration failed');
            return;
        }

        const oldestTimestamp = resp.result[0];
        if (oldestTimestamp === -1) {
            moduleLogger.info('No records found, nothing to delete.');
            return;
        }

        const endTimestamp = timestamp - this._metricRetentionMicroSecs;
        if (oldestTimestamp > endTimestamp) {
            moduleLogger.info('No records exceed retention period, nothing to delete.');
            return;
        }

        await async.eachSeries(
            sliceTimeRange(oldestTimestamp - 1, endTimestamp, expirationChunkDuration),
            async ([start, end]) => {
                moduleLogger.info('deleting metrics',
                    { start: oldestTimestamp, stop: endTimestamp });
                return this.withWarp10(async warp10 =>
                    warp10.delete({
                        className: '~.*',
                        start,
                        end,
                    }));
            },
        );
    }

    _checkHardLimit(size, nodeId) {
        const hardPercentage = (size / this._hardLimit).toFixed(2);
        const hardLimitHuman = formatDiskSize(this._hardLimit);
        const hardLogger = moduleLogger.with({
            size,
            sizeHuman: formatDiskSize(size),
            hardPercentage,
            hardLimit: this._hardLimit,
            hardLimitHuman,
            nodeId,
        });

        const msg = `Using ${hardPercentage * 100}% of the ${hardLimitHuman} hard limit on ${nodeId}`;

        if (hardPercentage < WARN_THRESHOLD) {
            hardLogger.debug(msg);
        } else if (hardPercentage >= WARN_THRESHOLD && hardPercentage < ACTION_THRESHOLD) {
            hardLogger.warn(msg);
        } else {
            hardLogger.error(msg);
            return true;
        }
        return false;
    }

    async _disableWarp10Updates() {
        return this.withWarp10(async warp10 =>
            warp10.exec({
                script: `
                DROP DROP
                'Hard limit has been reached. Further updates have been disabled.'
                'scality'
                UPDATEOFF`,
                params: {},
            }));
    }

    async _enableWarp10Updates() {
        return this.withWarp10(async warp10 =>
            warp10.exec({
                script: "DROP DROP 'scality' UPDATEON",
                params: {},
            }));
    }

    async _execute(timestamp) {
        if (this.isManualUnlock) {
            moduleLogger.info('manually unlocking warp 10', { nodeId: this.nodeId });
            await this._enableWarp10Updates();
            return;
        }

        if (this.isManualLock) {
            moduleLogger.info('manually locking warp 10', { nodeId: this.nodeId });
            await this._disableWarp10Updates();
            return;
        }

        if (this._expirationEnabled && this.isLeader) {
            moduleLogger.info(`expiring metrics older than ${config.diskUsage.retentionDays} days`);
            await this._expireMetrics(timestamp);
            return;
        }

        if (!this._enabled) {
            moduleLogger.debug('disk usage monitoring not enabled, skipping check');
            return;
        }

        let size = null;
        try {
            size = await this._getUsage();
        } catch (error) {
            moduleLogger.error(`error calculating disk usage for ${this._path}`, { error });
            return;
        }

        if (this._hardLimit !== null) {
            moduleLogger.info(`warp 10 leveldb using ${formatDiskSize(size)} of disk space`, { usage: size });

            const shouldLock = this._checkHardLimit(size, this.nodeId);
            if (shouldLock) {
                moduleLogger.warn('hard limit exceeded, disabling writes to warp 10', { nodeId: this.nodeId });
                await this._disableWarp10Updates();
            } else {
                moduleLogger.info('usage below hard limit, ensuring writes to warp 10 are enabled',
                    { nodeId: this.nodeId });
                await this._enableWarp10Updates();
            }
        }
    }
}

module.exports = MonitorDiskUsage;
