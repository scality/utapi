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

        const getLastSnapshot = this._getLastSnapshot.bind(this);
        const lastSnapshot = new promClient.Gauge({
            name: 'utapi_create_snapshot_last_snapshot_seconds',
            help: 'Timestamp of the last successfully created snapshot',
            labelNames: ['origin', 'containerName'],
            async collect() {
                try {
                    const timestamp = await getLastSnapshot();
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
            lastSnapshot,
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

    async _getLastSnapshot() {
        const resp = await this.withWarp10(async warp10 => warp10.fetch({
            className: 'utapi.snapshot.master',
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
