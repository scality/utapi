const assert = require('assert');
const async = require('async');
const promClient = require('prom-client');
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
        super({
            enableMetrics: config.metrics.enabled,
            metricsHost: config.metrics.host,
            metricsPort: config.metrics.ingestPort,
            ...options,
        });

        this._defaultSchedule = config.ingestionSchedule;
        this._defaultLag = config.ingestionLagSeconds;
        this._stripEventUUID = options.stripEventUUID !== undefined ? options.stripEventUUID : true;
    }

    // eslint-disable-next-line class-methods-use-this
    _registerMetricHandlers() {
        const ingestedTotal = new promClient.Counter({
            name: 'utapi_ingest_shard_task_ingest_total',
            help: 'Number of metrics ingested',
            labelNames: ['origin', 'containerName'],
        });

        const ingestedSlow = new promClient.Counter({
            name: 'utapi_ingest_shard_task_slow_total',
            help: 'Number of slow metrics ingested',
            labelNames: ['origin', 'containerName'],
        });

        const ingestedShards = new promClient.Counter({
            name: 'utapi_ingest_shard_task_shard_ingest_total',
            help: 'Number of slow metrics ingested',
            labelNames: ['origin', 'containerName'],
        });

        const shardAgeTotal = new promClient.Counter({
            name: 'utapi_ingest_shard_task_shard_age_total',
            help: 'Aggregated age of shards',
            labelNames: ['origin', 'containerName'],
        });

        return {
            ingestedTotal,
            ingestedSlow,
            ingestedShards,
            shardAgeTotal,
        };
    }

    /**
     * Metrics for IngestShardTask
     * @typedef {Object} IngestShardMetrics
     * @property {number} ingestedTotal - Number of events ingested
     * @property {number} ingestedSlow - Number of slow events ingested
     */

    /**
     *
     * @param {IngestShardMetrics} metrics - Metric values to push
     * @returns {undefined}
     */
    _pushMetrics(metrics) {
        if (!this._enableMetrics) {
            return;
        }

        if (metrics.ingestedTotal !== undefined) {
            this._metricsHandlers.ingestedTotal.inc(metrics.ingestedTotal);
        }

        if (metrics.ingestedSlow !== undefined) {
            this._metricsHandlers.ingestedSlow.inc(metrics.ingestedSlow);
        }

        if (metrics.ingestedShards !== undefined) {
            this._metricsHandlers.ingestedShards.inc(metrics.ingestedShards);
        }

        if (metrics.shardAgeTotal !== undefined) {
            this._metricsHandlers.shardAgeTotal.inc(metrics.shardAgeTotal);
        }
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

        let shardAgeTotal = 0;
        let ingestedShards = 0;
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
                                    labels: { origin: config.nodeId },
                                }, records,
                            );
                        });
                        assert.strictEqual(status, records.length);
                        await this._cache.deleteShard(shard);
                        logger.info(`ingested ${status} records from ${config.nodeId} into ${ingestedIntoNodeId}`);

                        shardAgeTotal += shardAge;
                        ingestedShards += 1;
                        this._pushMetrics({ ingestedTotal: records.length });
                        if (areSlowEvents) {
                            this._pushMetrics({ ingestedSlow: records.length });
                        }
                    } else {
                        logger.debug('No events found in shard, cleaning up');
                    }
                } else {
                    logger.warn('shard does not exist', { shard });
                }
            });
        const shardAgeTotalSecs = shardAgeTotal / 1000000;
        this._pushMetrics({ shardAgeTotal: shardAgeTotalSecs, ingestedShards });
    }
}

module.exports = IngestShardTask;
