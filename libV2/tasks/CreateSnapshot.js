const promClient = require('prom-client');
const BaseTask = require('./BaseTask');
const config = require('../config');
const { snapshotLagSecs } = require('../constants');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'CreateSnapshot',
});

class CreateSnapshot extends BaseTask {
    constructor(options) {
        super({
            enableMetrics: config.metrics.enabled,
            metricsHost: config.metrics.host,
            metricsPort: config.metrics.snapshotPort,
            ...options,
        });

        this._defaultSchedule = config.snapshotSchedule;
        this._defaultLag = snapshotLagSecs;
    }

    // eslint-disable-next-line class-methods-use-this
    _registerMetricHandlers() {
        const created = new promClient.Counter({
            name: 'utapi_create_snapshot_created_total',
            help: 'Number of snapshots created',
            labelNames: ['origin', 'containerName'],
        });

        return {
            created,
        };
    }

    /**
     * Metrics for CreateSnapshot
     * @typedef {Object} CreateSnapshotMetrics
     * @property {number} created - Number of snapshots created
     */

    /**
     *
     * @param {CreateSnapshotMetrics} metrics - Metric values to push
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
        logger.debug('creating snapshots', { snapshotTimestamp: timestamp });

        const status = await this.withWarp10(async warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                },
                macro: 'utapi/createSnapshot',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0]} snapshots`);
            this._pushMetrics({ created: status.result[0] });
        }
    }
}

module.exports = CreateSnapshot;
