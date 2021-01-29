/* eslint-disable no-restricted-syntax */
const async = require('async');
const { mpuBucketPrefix } = require('arsenal').constants;
const BaseTask = require('./BaseTask');
const { UtapiRecord } = require('../models');
const config = require('../config');
const metadata = require('../metadata');
const { serviceToWarp10Label, warp10RecordType } = require('../constants');

const { LoggerContext, convertTimestamp } = require('../utils');

const logger = new LoggerContext({
    module: 'ReindexTask',
});

class ReindexTask extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.reindexSchedule;
        this._defaultLag = 0;
    }

    static async _indexBucket(bucket) {
        let size = 0;
        let count = 0;
        let lastMaster = null;
        let lastMasterSize = null;

        for await (const obj of metadata.listObjects(bucket)) {
            if (obj.value.isDeleteMarker) {
                // eslint-disable-next-line no-continue
                continue;
            }
            count += 1;
            size += obj.value['content-length'];

            // If versioned, subtract the size of the master to avoid double counting
            if (lastMaster && obj.name === lastMaster) {
                logger.debug('Detected versioned key, subtracting master size', { lastMasterSize, key: obj.name });
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
                    start: timestamp,
                    end: timestamp,
                    node: warp10.nodeId,
                    labels: {
                        [level]: resource,
                    },
                },
                macro: 'utapi/getMetrics',
            };
            return warp10.exec(options);
        });
        return { timestamp, value: JSON.parse(res.result[0]) };
    }

    async _updateMetric(level, resource, total) {
        const { timestamp, value } = await this._fetchCurrentMetrics(level, resource);

        const objectDelta = total.count - value.numberOfObjects[0];
        const sizeDelta = total.size - value.storageUtilized[0];

        if (objectDelta !== 0 || sizeDelta !== 0) {
            logger.info('discrepancy detected in metrics, writing corrective record',
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

    async _execute() {
        logger.debug('reindexing objects');

        const accountTotals = {};
        const ignoredAccounts = new Set();

        await async.eachLimit(metadata.listBuckets(), 5, async bucket => {
            logger.trace('starting reindex of bucket', { bucket: bucket.name });

            const mpuBucket = `${mpuBucketPrefix}${bucket.name}`;
            let bktTotal;
            let mpuTotal;

            try {
                bktTotal = await async.retryable(ReindexTask._indexBucket)(bucket.name);
                mpuTotal = await async.retryable(ReindexTask._indexMpuBucket)(mpuBucket);
            } catch (error) {
                logger.error('failed to reindex bucket, ignoring associated account', { error, bucket: bucket.name });
                ignoredAccounts.add(bucket.account);
                return;
            }

            const total = {
                size: bktTotal.size + mpuTotal.size,
                count: bktTotal.count,
            };

            if (accountTotals[bucket.account]) {
                accountTotals[bucket.account].size += total.size;
                accountTotals[bucket.account].count += total.count;
            } else {
                accountTotals[bucket.account] = { ...total };
            }

            logger.trace('finished indexing bucket', { bucket: bucket.name });

            await this._updateMetric(
                serviceToWarp10Label.buckets,
                bucket.name,
                total,
            );
        });

        const toUpdate = Object.entries(accountTotals)
            .filter(([account]) => !ignoredAccounts.has(account));

        await async.eachLimit(toUpdate, 5, async ([account, total]) =>
            this._updateMetric(
                serviceToWarp10Label.accounts,
                account,
                total,
            ));

        logger.debug('finished reindexing');
    }
}

module.exports = ReindexTask;
