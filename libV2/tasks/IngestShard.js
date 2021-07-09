/* eslint-disable no-restricted-globals */
const assert = require('assert');
const async = require('async');
const BaseTask = require('./BaseTask');
const { UtapiMetric } = require('../models');
const { UtapiRecord } = require('../models');

const config = require('../config');
const { checkpointLagSecs, warp10RecordType, eventFieldsToWarp10 } = require('../constants');
const {
    LoggerContext, shardFromTimestamp, convertTimestamp, InterpolatedClock, now, comprehend,
} = require('../utils');
const { warp10 } = require('../config');

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

    _hydrateEvent(data, stripTimestamp = false) {
        const event = JSON.parse(data);
        if (this._stripEventUUID) {
            delete event.uuid;
        }
        if (stripTimestamp) {
            delete event.timestamp;
        }
        return new UtapiMetric(event);
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
                    const metrics = await this._cache.getMetricsForShard(shard);
                    if (metrics.length > 0) {
                        logger.info(`Ingesting ${metrics.length} events from shard`, { shard });
                        const shardAge = now() - shard;
                        const areSlowEvents = false; //shardAge >= checkpointLagMicroseconds;
                        const metricClass = areSlowEvents ? 'utapi.repair.event' : 'utapi.event';

                        if (areSlowEvents) {
                            logger.info('Detected slow records, ingesting as repair');
                        }

                        const factory = _checkpointFactory(['bucket', 'account']);

                        const records = metrics.map(m => this._hydrateEvent(m, areSlowEvents)).forEach(factory.update);

                        // console.log(JSON.stringi?fy(factory.checkpoints(), null, 4));
                        console.log(factory.newest());
                        // records.sort((a, b) => a.timestamp - b.timestamp);

                        // const clock = new InterpolatedClock();
                        // records.forEach(r => {
                        //     r.timestamp = clock.getTs(r.timestamp);
                        // });

                        const checkpointTimestamp = factory.newest();
                        const checkpoints = [];
                        Object.entries(factory.checkpoints())
                            .forEach(([level, chkpts]) => {
                                Object.entries(chkpts).forEach(([resource, checkpoint]) => {
                                    const record = new UtapiRecord({
                                        ...checkpoint,
                                        timestamp: checkpointTimestamp,
                                    });

                                    checkpoints.push({
                                        level,
                                        resource,
                                        data: new UtapiRecord({
                                            ...checkpoint,
                                            timestamp: checkpointTimestamp,
                                        }),
                                    });
                                });
                            });

                        await async.mapLimit(checkpoints, 10,
                            async checkpoint => {
                                let ingestedIntoNodeId;
                                const status = await this.withWarp10(async warp10 => {
                                // eslint-disable-next-line prefer-destructuring
                                    ingestedIntoNodeId = warp10.nodeId;
                                    return warp10.ingest(
                                        {
                                            className: 'utapi.checkpoint',
                                            labels: {
                                                origin: config.nodeId,
                                                [eventFieldsToWarp10[checkpoint.level]]: checkpoint.resource,
                                            },
                                            valueType: warp10RecordType,
                                        }, [checkpoint.data],
                                    );
                                });
                                // logger.info(
                                //     `ingested ${status} records from ${config.nodeId} into ${ingestedIntoNodeId}`,
                                // );
                            });


                        let ingestedIntoNodeId;
                        const status = await this.withWarp10(async warp10 => {
                            // eslint-disable-next-line prefer-destructuring
                            ingestedIntoNodeId = warp10.nodeId;
                            return warp10.ingest(
                                {
                                    className: 'utapi.checkpoint.master',
                                    labels: { origin: config.nodeId },
                                    valueType: warp10RecordType,

                                }, [new UtapiRecord({
                                    timestamp: checkpointTimestamp,
                                })],
                            );
                        });
                        // assert.strictEqual(status, records.length);
                        await this._cache.deleteShard(shard);
                        // logger.info(`ingested ${status} records from ${config.nodeId} into ${ingestedIntoNodeId}`);
                    } else {
                        logger.debug('No events found in shard, cleaning up');
                    }
                } else {
                    logger.warn('shard does not exist', { shard });
                }
            });
    }
}

module.exports = IngestShardTask;
