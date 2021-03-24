const assert = require('assert');
const async = require('async');
const BaseTask = require('./BaseTask');
const { UtapiMetric } = require('../models');
// const config = require('../config');
const { checkpointLagSecs } = require('../constants');
const {
    LoggerContext, shardFromTimestamp, convertTimestamp, InterpolatedClock, now,
} = require('../utils');

const logger = new LoggerContext({
    module: 'IngestShard',
});

const checkpointLagMicroseconds = convertTimestamp(checkpointLagSecs);

class IngestShardTask extends BaseTask {
    constructor(config, stripEventUUID = true) {
        super(config);
        this._stripEventUUID = stripEventUUID;
    }

    async _setup(config) {
        await super._setup(config);
        this._defaultSchedule = config.ingestionSchedule;
        this._defaultLag = config.ingestionLagSeconds;
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
                        const areSlowEvents = shardAge >= checkpointLagMicroseconds;
                        const metricClass = areSlowEvents ? 'utapi.repair.event' : 'utapi.event';

                        if (areSlowEvents) {
                            logger.info('Detected slow records, ingesting as repair');
                        }

                        const records = metrics.map(m => this._hydrateEvent(m, areSlowEvents));

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
                                    labels: { origin: this._nodeId },
                                }, records,
                            );
                        });
                        assert.strictEqual(status, records.length);
                        await this._cache.deleteShard(shard);
                        logger.info(`ingested ${status} records from ${this._nodeId} into ${ingestedIntoNodeId}`);
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
