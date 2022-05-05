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

        return {
            created,
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
