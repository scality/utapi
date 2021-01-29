const assert = require('assert');

const BaseTask = require('./BaseTask');
const config = require('../config');
const {
    LoggerContext, getFolderSize, formatDiskSize,
} = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'MonitorDiskUsage',
    path: config.diskUsage.path,
});

const WARN_THRESHOLD = 0.8;
const ACTION_THRESHOLD = 0.95;

const expirationBlockMicroSecs = config.diskUsage.expirationBlockSize * 60 * 60 * 1000000;

class MonitorDiskUsage extends BaseTask {
    constructor(options) {
        super(
            options,
        );
        this._defaultSchedule = config.diskUsageSchedule;
        this._defaultLag = 0;
        this._path = config.diskUsage.path;
        this._enabled = config.diskUsage.enabled;
        this._mode = config.diskUsage.mode;
        this._softLimit = config.diskUsage.softLimit || null;
    }

    async _setup() {
        await super._setup();
        this._program
            .option('--leader', 'Mark this process as the leader if operating in distributed mode.')
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

    _checkSoftLimit(size, nodeId) {
        const softPercentage = (size / this._softLimit).toFixed(2);
        const softLimitHuman = formatDiskSize(this._softLimit);
        const softLogger = moduleLogger.with({
            size,
            sizeHuman: formatDiskSize(size),
            softPercentage,
            softLimit: this._softLimit,
            softLimitHuman,
            nodeId,
        });

        const msg = `Using ${softPercentage * 100}% of the ${softLimitHuman} soft limit on ${nodeId}`;

        if (softPercentage < WARN_THRESHOLD) {
            softLogger.debug(msg);
        } else if (softPercentage >= WARN_THRESHOLD && softPercentage < ACTION_THRESHOLD) {
            softLogger.warn(msg);
        } else {
            softLogger.error(msg);
            return true;
        }
        return false;
    }


    async _expireMetrics() {
        const resp = await this._warp10.exec({
            macro: 'utapi/findOldestRecord',
            params: {
                class: '~.*',
                labels: {},
            },
        });

        if (!resp.result || resp.result.length !== 1) {
            moduleLogger.error('failed to fetch oldest record timestamp. expiration failed');
            return;
        }

        const oldestTimestamp = resp.result[0];
        if (oldestTimestamp === -1) {
            moduleLogger.error('No records found! nothing to delete!');
            return;
        }

        const endTimestamp = oldestTimestamp + expirationBlockMicroSecs - 1;
        moduleLogger.info(`deleting oldest ${config.diskUsage.expirationBlockSize}hr block of metrics`, {
            start: oldestTimestamp, stop: endTimestamp,
        });

        await this._warp10.delete({
            className: '~.*',
            start: oldestTimestamp - 1,
            end: endTimestamp,
        });
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

        const msg = `Using ${hardPercentage * 100}% of the ${hardLimitHuman} soft limit on ${nodeId}`;

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
        return this._warp10.exec({
            script: "DROP DROP 'Hard limit has been reached. Further updates have been disabled.' 'scality' UPDATEOFF",
            params: {},
        });
    }

    async _enableWarp10Updates() {
        return this._warp10.exec({
            script: "DROP DROP 'scality' UPDATEON",
            params: {},
        });
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

        if (!this._enabled) {
            moduleLogger.debug('disk usage monitoring not enabled, skipping check');
            return;
        }

        let size = null;
        if (!this.isLeader) {
            try {
                size = await this._getUsage();
            } catch (error) {
                moduleLogger.error(`error calculating disk usage for ${this._path}`, { error });
                return;
            }
            moduleLogger.debug(`using ${formatDiskSize(size)}`, { usage: size });
        }

        if (this._softLimit !== null) {
            let shouldDelete = false;
            if (this._mode === 'local') {
                moduleLogger.debug('Operating in local mode, only checking the current node');
                shouldDelete = await this._checkSoftLimit(size, this.nodeId);
            } else if (this._mode === 'distributed') {
                if (this.isLeader) {
                    try {
                        const resp = await this._warp10.fetch({
                            className: 'utapi.disk.monitor',
                            start: 'now',
                            stop: -1,
                        });

                        assert.notStrictEqual(resp.result, undefined);
                        assert.notStrictEqual(resp.result.length, 0);

                        if (resp.result[0] === '') {
                            moduleLogger.warn('no disk usage entries found');
                        } else {
                            shouldDelete = JSON.parse(resp.result)
                                .map(val => ({ node: val.l.node, used: val.v[0][1] }))
                                .map(val => this._checkSoftLimit(val.used, val.node))
                                .some(val => val);
                        }
                    } catch (error) {
                        moduleLogger.error('error fetching disk usage data from warp 10', { error });
                    }
                } else {
                    try {
                        const { count } = await this._warp10.update([{
                            timestamp,
                            className: 'utapi.disk.monitor',
                            value: size,
                            labels: { node: this.nodeId },
                        }]);
                        assert.strictEqual(count, 1);
                    } catch (error) {
                        moduleLogger.error('failed to write disk usage to warp 10', { error });
                    }
                }
            }

            if (shouldDelete) {
                moduleLogger.error('soft limit exceeded, expiring oldest block of metrics');
                await this._expireMetrics();
            }
        }

        if (this._hardLimit !== undefined) {
            const shouldLock = this._checkHardLimit(size, this.nodeId);
            if (shouldLock) {
                moduleLogger.error('hard limit exceeded, disabling writes to warp 10', { nodeId: this.nodeId });
                await this._disableWarp10Updates();
            } else {
                moduleLogger.error('usage below hard limit, ensuring writes to warp 10 are enabled',
                    { nodeId: this.nodeId });
                await this._enableWarp10Updates();
            }
        }
    }
}

module.exports = MonitorDiskUsage;
