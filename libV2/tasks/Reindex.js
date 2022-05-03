/* eslint-disable no-restricted-syntax */
const async = require('async');
const { mpuBucketPrefix } = require('arsenal').constants;
const BaseTask = require('./BaseTask');
const { UtapiRecord } = require('../models');
const config = require('../config');
const metadata = require('../metadata');
const { serviceToWarp10Label, warp10RecordType } = require('../constants');

const {
    LoggerContext,
    logEventFilter,
    convertTimestamp,
    buildFilterChain,
} = require('../utils');

const logger = new LoggerContext({
    module: 'ReindexTask',
});

class ReindexTask extends BaseTask {
    constructor(options) {
        super({
            ...options,
            enableMetrics: config.metrics.enabled,
            metricsHost: config.metrics.host,
            metricsPort: config.metrics.reindexPort,
        });

        this._defaultSchedule = config.reindexSchedule;
        this._defaultLag = 0;
        const eventFilters = (config && config.filter) || {};
        this._shouldReindex = buildFilterChain((config && config.filter) || {});
        if (Object.keys(eventFilters).length !== 0) {
            logEventFilter((...args) => logger.info(...args), 'reindex resource filtering enabled', eventFilters);
        }
    }

    async _setup(includeDefaultOpts = true) {
        await super._setup(includeDefaultOpts);
        this._program.option(
            '--bucket <bucket>',
            'Manually specify a bucket to reindex. Can be used multiple times.',
            (bucket, previous) => previous.concat([bucket]),
            [],
        );
    }

    static async _indexBucket(bucket) {
        let size = 0;
        let count = 0;
        let lastMaster = null;
        let lastMasterSize = null;

        for await (const obj of metadata.listObjects(bucket)) {
            if (obj.value.isDeleteMarker || obj.value.isPHD) {
                // eslint-disable-next-line no-continue
                continue;
            }

            if (!Number.isInteger(obj.value['content-length'])) {
                logger.debug('object missing content-length, not including in count');
                // eslint-disable-next-line no-continue
                continue;
            }

            count += 1;
            size += obj.value['content-length'];

            // If versioned, subtract the size of the master to avoid double counting
            if (lastMaster && obj.name === lastMaster) {
                logger.debug('Detected versioned key. subtracting master size', { lastMasterSize, key: obj.name });
                size -= lastMasterSize;
                count -= 1;
                lastMaster = null;
                lastMasterSize = null;
            // Only save master versions
            } else if (!obj.version) {
                lastMaster = obj.name;
                lastMasterSize = obj.value['content-length'];
            }
        }

        return { size, count };
    }

    static async _indexMpuBucket(bucket) {
        if (await metadata.bucketExists(bucket)) {
            return ReindexTask._indexBucket(bucket);
        }

        return { size: 0, count: 0 };
    }

    async _fetchCurrentMetrics(level, resource) {
        const timestamp = convertTimestamp(new Date().getTime());
        const res = await this.withWarp10(warp10 => {
            const options = {
                params: {
                    end: timestamp,
                    node: warp10.nodeId,
                    labels: {
                        [level]: resource,
                    },
                    // eslint-disable-next-line camelcase
                    no_reindex: true,
                },
                macro: 'utapi/getMetricsAt',
            };
            return warp10.exec(options);
        });

        const [value] = res.result || [];
        if (!value) {
            throw new Error('unable to fetch current metrics from warp10');
        }

        if (!Number.isInteger(value.objD) || !Number.isInteger(value.sizeD)) {
            logger.error('invalid values returned from warp 10', { response: res });
            throw new Error('invalid values returned from warp 10');
        }

        return {
            timestamp,
            value,
        };
    }

    async _updateMetric(level, resource, total) {
        const { timestamp, value } = await this._fetchCurrentMetrics(level, resource);

        const objectDelta = total.count - value.objD;
        const sizeDelta = total.size - value.sizeD;

        if (objectDelta !== 0 || sizeDelta !== 0) {
            logger.info('discrepancy detected in metrics. writing corrective record',
                { [level]: resource, objectDelta, sizeDelta });

            const record = new UtapiRecord({
                objectDelta,
                sizeDelta,
                timestamp,
            });
            await this.withWarp10(warp10 => warp10.ingest(
                {
                    className: 'utapi.repair.reindex',
                    labels: {
                        [level]: resource,
                    },
                    valueType: warp10RecordType,
                },
                [record],
            ));
        }
    }

    get targetBuckets() {
        if (this._program.bucket.length) {
            return this._program.bucket.map(name => ({ name }));
        }

        return metadata.listBuckets();
    }

    async _execute() {
        logger.info('started reindex task');

        const accountTotals = {};
        const ignoredAccounts = new Set();
        await async.eachLimit(this.targetBuckets, 5, async bucket => {
            if (!this._shouldReindex({ bucket: bucket.name, account: bucket.account })) {
                logger.debug('skipping excluded bucket', { bucket: bucket.name, account: bucket.account });
                return;
            }

            logger.info('started bucket reindex', { bucket: bucket.name });

            const mpuBucket = `${mpuBucketPrefix}${bucket.name}`;
            let bktTotal;
            let mpuTotal;

            try {
                bktTotal = await async.retryable(ReindexTask._indexBucket)(bucket.name);
                mpuTotal = await async.retryable(ReindexTask._indexMpuBucket)(mpuBucket);
            } catch (error) {
                logger.error(
                    'failed bucket reindex. any associated account will be skipped',
                    { error, bucket: bucket.name },
                );
                // buckets passed with `--bucket` won't have an account property
                if (bucket.account) {
                    ignoredAccounts.add(bucket.account);
                }
                return;
            }

            const total = {
                size: bktTotal.size + mpuTotal.size,
                count: bktTotal.count,
            };

            // buckets passed with `--bucket` won't have an account property
            if (bucket.account) {
                if (accountTotals[bucket.account]) {
                    accountTotals[bucket.account].size += total.size;
                    accountTotals[bucket.account].count += total.count;
                } else {
                    accountTotals[bucket.account] = { ...total };
                }
            }

            logger.info('finished bucket reindex', { bucket: bucket.name });

            try {
                await this._updateMetric(
                    serviceToWarp10Label.buckets,
                    bucket.name,
                    total,
                );
            } catch (error) {
                logger.error('error updating metrics for bucket', { error, bucket: bucket.name });
            }
        });

        const toUpdate = Object.entries(accountTotals)
            .filter(([account]) => !ignoredAccounts.has(account));

        await async.eachLimit(toUpdate, 5, async ([account, total]) => {
            try {
                await this._updateMetric(
                    serviceToWarp10Label.accounts,
                    account,
                    total,
                );
            } catch (error) {
                logger.error('error updating metrics for account', { error, account });
            }
        });

        logger.info('finished reindex task');
    }
}

module.exports = ReindexTask;
