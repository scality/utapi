const assert = require('assert');
const async = require('async');
const BaseTask = require('./BaseTask');
const { UtapiMetric } = require('../models');
const config = require('../config');
const { checkpointLagSecs } = require('../constants');
const {
    LoggerContext, shardFromTimestamp, convertTimestamp, InterpolatedClock, now,
} = require('../utils');

const logger = new LoggerContext({
    module: 'IngestShard',
});

const checkpointLagMicroseconds = convertTimestamp(checkpointLagSecs);

class IngestShardTask extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.ingestionSchedule;
        this._defaultLag = config.ingestionLagSeconds;
        this._stripEventUUID = options.stripEventUUID !== undefined ? options.stripEventUUID : true;
    }

    _hydrateEvent(data) {
        const event = JSON.parse(data);
        if (data.bucket && data.bucket.startsWith('benchmark-utapiv2-accuracy-4kb-')) {
            console.log(data.timestamp);
        }
        if (this._stripEventUUID) {
            delete event.uuid;
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
                        let metricClass;
                        let records;
                        if (shardAge < checkpointLagMicroseconds) {
                            metricClass = 'utapi.event';
                            records = metrics
                                .map(m => this._hydrateEvent(m));
                        } else {
                            logger.info('Detected slow records, ingesting as repair');
                            metricClass = 'utapi.repair.event';
                            const clock = new InterpolatedClock();
                            records = metrics
                                .map(data => {
                                    const metric = this._hydrateEvent(data);
                                    metric.timestamp = clock.getTs();
                                    return metric;
                                });
                        }
                        let nodeId;
                        const status = await this.withWarp10(async warp10 => {
                            // eslint-disable-next-line prefer-destructuring
                            nodeId = warp10.nodeId;
                            return warp10.ingest({ className: metricClass }, records);
                        });
                        assert.strictEqual(status, records.length);
                        await this._cache.deleteShard(shard);
                        logger.info(`ingested ${status} records into ${nodeId}`);
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
