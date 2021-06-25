const assert = require('assert');
const async = require('async');
const BaseTask = require('./BaseTask');
const { UtapiMetric } = require('../models');
const config = require('../config');
const { checkpointLagSecs } = require('../constants');
const {
    LoggerContext, shardFromTimestamp, convertTimestamp, InterpolatedClock, now, comprehend,
} = require('../utils');

const logger = new LoggerContext({
    module: 'IngestShard',
});

const checkpointLagMicroseconds = convertTimestamp(checkpointLagSecs);

function _updateCheckpoint(checkpoint, metric) {
    return {
        objD: checkpoint.objD + metric.objD,
        sizeD: checkpoint.sizeD + metric.sizeD,
        inB: checkpoint.inB + metric.inB,
        outB: checkpoint.outB + metric.outB,
    };
}

function _checkpointFactory(labels) {
    const checkpoints = comprehend(labels, key => ({ key, value: {} }));
    let oldest = NaN;
    let newest = NaN;
    return {
        update: metric => {
            oldest = metric.timestamp < oldest || NaN.isNan(oldest) ? metric.timestamp : oldest;
            newest = metric.timestamp > newest || NaN.isNan(newest) ? metric.timestamp : newest;
            labels
                .filter(label => !!metric[label])
                .forEach(label => {
                    const value = metric[label];
                    const checkpoint = checkpoints[label][value];
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

                        records.sort((a, b) => a.timestamp - b.timestamp);

                        const clock = new InterpolatedClock();
                        records.forEach(r => {
                            r.timestamp = clock.getTs(r.timestamp);
                        });

                        let ingestedIntoNodeId;
                        const status = await this.withWarp10(async warp10 => {
                            // eslint-disable-next-line prefer-destructuring
                            ingestedIntoNodeId = warp10.nodeId;
                            return warp10.ingest(
                                {
                                    className: metricClass,
                                    labels: { origin: config.nodeId },
                                }, records,
                            );
                        });
                        assert.strictEqual(status, records.length);
                        await this._cache.deleteShard(shard);
                        logger.info(`ingested ${status} records from ${config.nodeId} into ${ingestedIntoNodeId}`);
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
