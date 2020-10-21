/* eslint-disable no-await-in-loop, no-restricted-syntax, no-loop-func */
const async = require('async');
const { jsutil } = require('arsenal');
const BaseTask = require('./BaseTask');
const { UtapiRecord } = require('../models');
const config = require('../config');
const errors = require('../errors');
const RedisClient = require('../redis');
const { warp10RecordType, operations: operationIds, serviceToWarp10Label } = require('../constants');
const {
    LoggerContext,
    now,
    convertTimestamp,
    comprehend,
} = require('../utils');

const REDIS_CHUNKSIZE = 50;
const WARP10_SCAN_SIZE = 100;

const logger = new LoggerContext({
    module: 'MigrateTask',
});


function lowerCaseFirst(string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
}

const LEVELS_TO_MIGRATE = [
    'buckets',
    'users',
    'accounts',
    // TODO support service level metrics
    // 'service',
];


class MigrateTask extends BaseTask {
    constructor(options) {
        super({
            warp10: {
                requestTimeout: 30000,
                connectTimeout: 30000,
            },
            ...options,
        });

        this._failedCorrections = [];
        this._redis = new RedisClient(config.redis);
    }

    static _parseMetricValue(value) {
        if (value.includes(':')) {
            return parseInt(value.split(':')[0], 10);
        }
        return parseInt(value, 10);
    }

    static async* _iterStream(stream) {
        let finished = false;
        let data;

        stream.on('end', () => { finished = true; });
        stream.pause();
        while (!finished) {
            data = await new Promise(resolve => {
                const _resolve = jsutil.once(resolve);
                const end = () => _resolve([]);
                stream.once('end', end);
                stream.once('data', _data => {
                    stream.pause();
                    stream.off('end', end);
                    _resolve(_data);
                });
                stream.resume();
            });

            for (const item of data) {
                yield item;
            }
        }
    }

    async* _iterResources(level) {
        const redis = this._redis._redis;
        const keys = MigrateTask._iterStream(redis.scanStream({
            count: 100,
            match: `s3:${level}:*:storageUtilized`,
        }));

        for await (const key of keys) {
            yield key.split(':')[2];
        }
    }

    async* _iterIntervalOperations(level, resource, timestamp) {
        const redis = this._redis._redis;
        const keys = MigrateTask._iterStream(
            redis.scanStream({
                count: 100,
                match: `s3:${level}:${timestamp}:${resource}:*`,
            }),
        );

        for await (const key of keys) {
            const count = MigrateTask._parseMetricValue(await redis.get(key));
            const op = lowerCaseFirst(key.split(':')[4]);
            yield { op, count };
        }
    }

    async* _iterSortedSet(key) {
        let start = 0;
        while (true) {
            // zrange is inclusive
            const end = start + REDIS_CHUNKSIZE - 1;
            const results = await this._redis.call(async redis => redis.zrange(key, start, end, 'WITHSCORES'));

            for (let x = 0; x < results.length - 1; x += 2) {
                yield {
                    value: MigrateTask._parseMetricValue(results[x]),
                    score: MigrateTask._parseMetricValue(results[x + 1]),
                };
            }

            if (results.length < REDIS_CHUNKSIZE) {
                break;
            }

            start += REDIS_CHUNKSIZE;
        }
    }

    async* _iterMetrics(level, resource) {
        let storageUtilizedOffset = 0;
        let numberOfObjectsOffset = 0;
        for await (const entry of this._iterSortedSet(`s3:${level}:${resource}:storageUtilized`)) {
            const { score: timestamp, value: storageUtilized } = entry;
            const numberOfObjectsResp = await this._redis.call(redis => redis.zrangebyscore(
                `s3:${level}:${resource}:numberOfObjects`,
                timestamp,
                timestamp,
            ));
            const numberOfObjects = MigrateTask._parseMetricValue(numberOfObjectsResp[0]);

            let incomingBytes = 0;
            let outgoingBytes = 0;
            const operations = {};

            for await (const apiOp of this._iterIntervalOperations(level, resource, timestamp)) {
                if (apiOp.op === 'incomingBytes') {
                    incomingBytes = apiOp.count;
                } else if (apiOp.op === 'outgoingBytes') {
                    outgoingBytes = apiOp.count;
                } else if (operationIds.includes(apiOp.op)) {
                    operations[apiOp.op] = apiOp.count;
                } else {
                    logger.warn('dropping unknown operation', { apiOp });
                }
            }

            yield {
                timestamp: convertTimestamp(timestamp),
                sizeDelta: storageUtilized - storageUtilizedOffset,
                objectDelta: numberOfObjects - numberOfObjectsOffset,
                incomingBytes,
                outgoingBytes,
                operations,
            };

            storageUtilizedOffset = storageUtilized;
            numberOfObjectsOffset = numberOfObjects;
        }
    }

    async _findLatestSnapshot(level, resource) {
        const resp = await this._warp10.fetch({
            className: 'utapi.snapshot',
            labels: {
                [serviceToWarp10Label[level]]: resource,
            },
            start: 'now',
            stop: -1,
        });

        if (resp.result && (resp.result.length === 0 || resp.result[0] === '')) {
            return null;
        }

        const result = JSON.parse(resp.result[0])[0];
        return result.v[0][0];
    }

    async _findOldestSnapshot(level, resource, beginTimestamp) {
        let pos = beginTimestamp;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const resp = await this._warp10.fetch({
                className: 'utapi.snapshot',
                labels: {
                    [serviceToWarp10Label[level]]: resource,
                },
                start: pos - 1,
                stop: -WARP10_SCAN_SIZE,
            });
            if (resp.result && resp.result.length === 0) {
                return pos;
            }

            const results = JSON.parse(resp.result[0]);
            if (results.length === 0) {
                return pos;
            }

            const { v: values } = results[0];
            [pos] = values[values.length - 1];
        }
    }

    async _migrateMetric(className, level, resource, metric) {
        return this._warp10.ingest(
            {
                className,
                labels: {
                    [serviceToWarp10Label[level]]: resource,
                },
                valueType: warp10RecordType,
            },
            [metric],
        );
    }

    static _sumRecord(a, b) {
        const objectDelta = (a.objectDelta || 0) + (b.objectDelta || 0);
        const sizeDelta = (a.sizeDelta || 0) + (b.sizeDelta || 0);
        const incomingBytes = (a.incomingBytes || 0) + (b.incomingBytes || 0);
        const outgoingBytes = (a.outgoingBytes || 0) + (b.outgoingBytes || 0);
        const operationKeys = new Set(Object.keys(a.operations || {}).concat(Object.keys(b.operations || {})));
        // eslint-disable-next-line no-unused-vars
        const operations = comprehend(Array.from(operationKeys), (_, key) => (
            {
                key,
                value: ((a.operations || {})[key] || 0) + ((b.operations || {})[key] || 0),
            }
        ));

        return new UtapiRecord({
            timestamp: b.timestamp || a.timestamp,
            sizeDelta,
            objectDelta,
            incomingBytes,
            outgoingBytes,
            operations,
        });
    }

    async _migrateResource(level, resource, ingest = true) {
        logger.trace('migrating metrics for resource', { metricLevel: level, resource });
        if (!ingest) {
            logger.debug('ingestion is disabled, no records will be written', { metricLevel: level, resource });
        }

        const latestSnapshot = await this._findLatestSnapshot(level, resource);
        const oldestSnapshot = latestSnapshot !== null
            ? await this._findOldestSnapshot(level, resource, latestSnapshot)
            : null;

        let correction = new UtapiRecord();
        for await (const metric of this._iterMetrics(level, resource)) {
            // Add metric to correction if it predates the latest snapshot
            if (latestSnapshot !== null && metric.timestamp < latestSnapshot) {
                correction = MigrateTask._sumRecord(correction, metric);
            }

            const _logger = logger.with({ metricLevel: level, resource, metricTimestamp: metric.timestamp });

            if (ingest) {
                let toIngest = new UtapiRecord(metric);
                let className = 'utapi.checkpoint';

                // Metric predates the oldest snapshot
                if (oldestSnapshot !== null && metric.timestamp < oldestSnapshot) {
                    _logger.trace('ingesting metric as snapshot');
                    className = 'utapi.snapshot';
                    toIngest = new UtapiRecord({
                        ...correction.getValue(),
                        timestamp: metric.timestamp,
                    });

                // Metric in between oldest and latest snapshots
                } else {
                    _logger.trace('ingesting metric as checkpoint');
                }

                await this._migrateMetric(className, level, resource, toIngest);

            } else {
                logger.trace('skipping ingestion of metric');
            }
        }
        return correction;
    }

    async _migrateResourceLevel(level) {
        const _logger = logger.with({ metricLevel: level });
        _logger.debug('migrating metric level');
        return async.eachLimit(this._iterResources(level), 5, async resource => {
            let totals;
            const migrated = await this._isMigrated(level, resource);
            try {
                totals = await this._migrateResource(level, resource, !migrated);
            } catch (error) {
                _logger.error('failed to migrate resource', { resource, error });
                throw error;
            }

            if (!await this._markMigrated(level, resource)) {
                const error = new Error('Failed to mark resource as migrated');
                _logger.error('failed to migrate resource', { resource, error });
                throw error;
            }

            const correction = new UtapiRecord({
                ...totals.getValue(),
                timestamp: now(),
            });

            if (!await this._isCorrected(level, resource)) {
                try {
                    _logger.debug('ingesting correction for metrics', { resource });
                    await this._migrateMetric('utapi.repair.event', level, resource, correction);
                } catch (error) {
                    this._failedCorrections.push(correction);
                    _logger.error('error during correction', { resource, error });
                    throw errors.FailedMigration;
                }

                if (!await this._markCorrected(level, resource)) {
                    this._failedCorrections.push(correction);
                    const error = errors.FailedMigration.customizeDescription(
                        'Failed to mark resource as corrected,'
                        + ' this can lead to inconsistencies if not manually corrected',
                    );
                    _logger.error('failed to migrate resource', { resource, error });
                    throw error;
                }
            } else {
                _logger.trace('already marked as corrected, skipping correction', { resource });
            }
        });
    }

    async _getStatusKey(level, resource, stage) {
        const key = `s3:migration:${level}:${resource}:${stage}`;
        const res = await async.retry(3, async () => this._redis.call(redis => redis.get(key)));
        return res === resource;
    }

    async _setStatusKey(level, resource, stage) {
        const key = `s3:migration:${level}:${resource}:${stage}`;
        try {
            const res = await async.retry(3, async () => this._redis.call(redis => redis.set(key, resource)));
            return res === 'OK';
        } catch (error) {
            logger.error('error setting migration status key', {
                metricLevel: level, resource, key, error,
            });
            return false;
        }
    }

    _isMigrated(level, resource) {
        return this._getStatusKey(level, resource, 'migrated');
    }

    _markMigrated(level, resource) {
        return this._setStatusKey(level, resource, 'migrated');
    }

    _isCorrected(level, resource) {
        return this._getStatusKey(level, resource, 'corrected');
    }

    _markCorrected(level, resource) {
        return this._setStatusKey(level, resource, 'corrected');
    }

    async _start() {
        this._redis.connect();
        return super._start();
    }

    async _join() {
        await super._join();
        await this._redis.disconnect();
    }

    async _execute() {
        logger.debug('migrating account metrics to v2');
        try {
            await async.eachSeries(LEVELS_TO_MIGRATE, this._migrateResourceLevel.bind(this));
        } catch (error) {
            logger.error('migration failed with error', { error });
            if (error.code === 1000) {
                logger.info('This error is idempotent and migration can simply be restarted.');
            } else if (error.code === 1001) {
                logger.warn('This error requires manual correction before migration can be restarted.',
                    { failedCorrections: this._failedCorrections });
            }
        }
    }
}

module.exports = MigrateTask;
