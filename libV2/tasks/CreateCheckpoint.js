const promClient = require('prom-client');
const BaseTask = require('./BaseTask');
const config = require('../config');
const { checkpointLagSecs, indexedEventFields } = require('../constants');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'CreateCheckpoint',
});

class CreateCheckpoint extends BaseTask {
    constructor(options) {
        super({
            enableMetrics: config.metrics.enabled,
            metricsHost: config.metrics.host,
            metricsPort: config.metrics.checkpointPort,
            ...options,
        });

        this._defaultSchedule = config.checkpointSchedule;
        this._defaultLag = checkpointLagSecs;
    }

    // eslint-disable-next-line class-methods-use-this
    _registerMetricHandlers() {
        const created = new promClient.Counter({
            name: 'utapi_create_checkpoint_created_total',
            help: 'Number of checkpoints created',
            labelNames: ['origin', 'containerName'],
        });

        const getLastCheckpoint = this._getLastCheckpoint.bind(this);
        const lastCheckpoint = new promClient.Gauge({
            name: 'utapi_create_checkpoint_last_checkpoint_seconds',
            help: 'Timestamp of the last successfully created checkpoint',
            labelNames: ['origin', 'containerName'],
            async collect() {
                try {
                    const timestamp = await getLastCheckpoint();
                    if (timestamp !== null) {
                        this.set(timestamp);
                    }
                } catch (error) {
                    logger.error('error during metric collection', { error });
                }
            },
        });

        return {
            created,
            lastCheckpoint,
        };
    }

    /**
     * Metrics for CreateCheckpoint
     * @typedef {Object} CreateCheckpointMetrics
     * @property {number} created - Number of checkpoints created
     */

    /**
     *
     * @param {CreateCheckpointMetrics} metrics - Metric values to push
     * @returns {undefined}
     */
    _pushMetrics(metrics) {
        if (!this._enableMetrics) {
            return;
        }

        if (metrics.created !== undefined) {
            this._metricsHandlers.created.inc(metrics.created);
        }
    }

    async _getLastCheckpoint() {
        const resp = await this.withWarp10(async warp10 => warp10.fetch({
            className: 'utapi.checkpoint.master',
            labels: {
                node: warp10.nodeId,
            },
            start: 'now',
            stop: -1,
        }));

        if (!resp.result || (resp.result.length === 0 || resp.result[0] === '' || resp.result[0] === '[]')) {
            return null;
        }

        const result = JSON.parse(resp.result[0])[0];
        const timestamp = result.v[0][0];
        return timestamp / 1000000;// Convert timestamp from microseconds to seconds
    }

    async _execute(timestamp) {
        logger.debug('creating checkpoints', { checkpointTimestamp: timestamp });
        const status = await this.withWarp10(async warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                    fields: indexedEventFields,
                },
                macro: 'utapi/createCheckpoint',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0] || 0} checkpoints`);
            this._pushMetrics({ created: status.result[0] });
        }
    }
}

module.exports = CreateCheckpoint;
