const assert = require('assert');
const BaseTask = require('./BaseTask');
const { UtapiMetric } = require('../models');
const config = require('../config');
const {
    LoggerContext, shardFromTimestamp, convertTimestamp, InterpolatedClock,
} = require('../utils');
const { shardIngestLagSecs, checkpointLagSecs } = require('../constants');

const logger = new LoggerContext({
    module: 'IngestShard',
});

const now = () => convertTimestamp(new Date().getTime());
const checkpointLagMicroseconds = convertTimestamp(checkpointLagSecs);

class IngestShardTask extends BaseTask {
    constructor(...options) {
        super(...options);
        this._defaultSchedule = config.ingestionSchedule;
        this._defaultLag = shardIngestLagSecs;
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

        await Promise.all(toIngest.map(
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
                                .map(m => new UtapiMetric(JSON.parse(m)));
                        } else {
                            logger.info('Detected slow records, ingesting as repair');
                            metricClass = 'utapi.repair.event';
                            const clock = new InterpolatedClock();
                            records = metrics
                                .map(data => {
                                    const metric = JSON.parse(data);
                                    metric.timestamp = clock.getTs();
                                    return new UtapiMetric(metric);
                                });
                        }
                        const status = await this._warp10.ingest({ className: metricClass }, records);
                        assert.strictEqual(status, records.length);
                        await this._cache.deleteShard(shard);
                    } else {
                        logger.debug('No events found in shard, cleaning up');
                    }
                } else {
                    logger.warn('shard does not exist', { shard });
                }
            },
        ));
    }
}

module.exports = IngestShardTask;
