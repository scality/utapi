const assert = require('assert');

const BaseTask = require('./BaseTask');
const config = require('../config');
const {
    LoggerContext, getFolderSize, formatDiskSize, now,
} = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'MonitorDiskUsage',
    path: config.diskUsage.path,
});

const WARN_THRESHOLD = 0.8;
const ACTION_THRESHOLD = 0.95;

const softLimitHuman = formatDiskSize(config.diskUsage.softLimit);
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
    }

    async _setup() {
        await super._setup();
        this._program.option('--leader', 'Mark this process as the leader if operating in distributed mode.');
    }

    get isLeader() {
        return this._program.leader !== undefined;
    }

    _getUsage() {
        moduleLogger.debug(`calculating disk usage for ${this._path}`);
        return getFolderSize(this._path);
    }

    static _checkSoftLimit(size, nodeId) {
        const softPercentage = (size / config.diskUsage.softLimit).toFixed(2);

        const softLogger = moduleLogger.with({
            size,
            sizeHuman: formatDiskSize(size),
            softLimit: config.diskUsage.softLimit,
            softPercentage,
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

        const endTimestamp = oldestTimestamp + expirationBlockMicroSecs;
        moduleLogger.info(`deleting oldest ${config.diskUsage.expirationBlockSize}hr block of metrics`, {
            start: oldestTimestamp, stop: endTimestamp,
        });

        await this._warp10.delete({
            className: '~.*',
            start: oldestTimestamp,
            end: endTimestamp,
        });
    }

    async _execute() {
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


        if (config.diskUsage.softLimit !== undefined) {
            let shouldDelete = false;
            if (this._mode === 'local') {
                moduleLogger.debug('Operating in local mode, only checking the current node');
                shouldDelete = await MonitorDiskUsage._checkSoftLimit(size, this.nodeId);
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
                                .map(val => MonitorDiskUsage._checkSoftLimit(val.used, val.node))
                                .some(val => val);
                        }
                    } catch (error) {
                        moduleLogger.error('error fetching disk usage data from warp 10', { error });
                    }
                } else {
                    try {
                        const { count } = await this._warp10.update([{
                            timestamp: now(),
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
    }
}

module.exports = MonitorDiskUsage;
