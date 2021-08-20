/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
const assert = require('assert');
const async = require('async');
const BaseTask = require('./BaseTask');
const { UtapiRecord } = require('../models');
const config = require('../config');
const { checkpointLagSecs, warp10RecordType, eventFieldsToWarp10 } = require('../constants');
const {
    LoggerContext, shardFromTimestamp, convertTimestamp, InterpolatedClock, now, comprehend,
} = require('../utils');

const logger = new LoggerContext({
    module: 'IngestShard',
});

const checkpointLagMicroseconds = convertTimestamp(checkpointLagSecs);

function orZero(value) {
    return value || 0;
}

function _updateCheckpoint(checkpoint, metric) {
    const ops = checkpoint.operations || {};
    return {
        objectDelta: orZero(checkpoint.objectDelta) + orZero(metric.objectDelta),
        sizeDelta: orZero(checkpoint.sizeDelta) + orZero(metric.sizeDelta),
        incomingBytes: orZero(checkpoint.incomingBytes) + orZero(metric.incomingBytes),
        outgoingBytes: orZero(checkpoint.outgoingBytes) + orZero(metric.outgoingBytes),
        operations: { ...ops, [metric.operationId]: (ops[metric.operationId] || 0) + 1 },
    };
}

function _checkpointFactory(labels) {
    const checkpoints = comprehend(labels, (_, key) => ({ key, value: {} }));
    let oldest = NaN;
    let newest = NaN;
    return {
        update: metric => {
            oldest = metric.timestamp < oldest || isNaN(oldest) ? metric.timestamp : oldest;
            newest = metric.timestamp > newest || isNaN(newest) ? metric.timestamp : newest;
            labels
                .filter(label => !!metric[label])
                .forEach(label => {
                    const value = metric[label];
                    const checkpoint = checkpoints[label][value] || {};
                    checkpoints[label][value] = _updateCheckpoint(checkpoint, metric);
                });
        },
        checkpoints: () => (checkpoints),
        oldest: () => (oldest),
        newest: () => (newest),
    };
}

class IngestShardTask extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.ingestionSchedule;
        this._defaultLag = config.ingestionLagSeconds;
        this._stripEventUUID = options.stripEventUUID !== undefined ? options.stripEventUUID : true;
    }

    async _execute(timestamp) {
        const endShard = shardFromTimestamp(timestamp);
        logger.debug('ingesting shards', { endShard });

        const available = await this._cache.getShards();
        const toIngest = available
            .map(key => key.split(':')[2])
            .filter(key => parseInt(key, 10) <= endShard);

        if (toIngest.length === 0) {
            logger.debug('no shard available to ingest');
            return;
        }

        await async.eachLimit(toIngest, 10,
            async shard => {
                if (await this._cache.shardExists(shard)) {
                    const factory = _checkpointFactory(['bucket', 'account']);
                    for await (const metric of this._cache.getMetricsForShard(shard)) {
                        factory.update(metric);
                    }

                    const shardAge = now() - shard;
                    const areSlowEvents = shardAge >= checkpointLagMicroseconds;
                    const metricClass = areSlowEvents ? 'utapi.repair.checkpoint' : 'utapi.checkpoint';

                    if (areSlowEvents) {
                        logger.info('Detected slow records, ingesting as repair');
                    }

                    const checkpoints = [];
                    const checkpointTimestamp = areSlowEvents ? now() : shard;

                    Object.entries(factory.checkpoints())
                        .forEach(([level, chkpts]) => {
                            Object.entries(chkpts).forEach(([resource, checkpoint]) => {
                                const data = new UtapiRecord({
                                    ...checkpoint,
                                    timestamp: checkpointTimestamp,
                                });
                                checkpoints.push({
                                    className: metricClass,
                                    valueType: warp10RecordType,
                                    labels: {
                                        origin: config.nodeId,
                                        [eventFieldsToWarp10[level]]: resource,
                                    },
                                    data,
                                });
                            });
                        });

                    let ingestedIntoNodeId;
                    const status = await this.withWarp10(async warp10 => {
                        // eslint-disable-next-line prefer-destructuring
                        ingestedIntoNodeId = warp10.nodeId;
                        return warp10.ingest(checkpoints);
                    });
                    assert.strictEqual(status, checkpoints.length);
                    await this._cache.deleteShard(shard);
                    logger.info(`ingested ${status} records from ${config.nodeId} into ${ingestedIntoNodeId}`);
                } else {
                    logger.warn('shard does not exist', { shard });
                }
            });
    }
}

module.exports = IngestShardTask;
