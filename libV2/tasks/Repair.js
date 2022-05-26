const promClient = require('prom-client');
const BaseTask = require('./BaseTask');
const config = require('../config');
const { LoggerContext } = require('../utils');
const { repairLagSecs, indexedEventFields } = require('../constants');

const logger = new LoggerContext({
    module: 'Repair',
});

class RepairTask extends BaseTask {
    constructor(options) {
        super({
            enableMetrics: config.metrics.enabled,
            metricsHost: config.metrics.host,
            metricsPort: config.metrics.repairPort,
            ...options,
        });

        this._defaultSchedule = config.repairSchedule;
        this._defaultLag = repairLagSecs;
    }

    // eslint-disable-next-line class-methods-use-this
    _registerMetricHandlers() {
        const created = new promClient.Counter({
            name: 'utapi_repair_task_created_total',
            help: 'Number of repair records created',
            labelNames: ['origin', 'containerName'],
        });

        return {
            created,
        };
    }

    /**
     * Metrics for RepairTask
     * @typedef {Object} RepairMetrics
     * @property {number} created - Number of repair records created
     */

    /**
     *
     * @param {RepairMetrics} metrics - Metric values to push
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
        logger.debug('Checking for repairs', { timestamp, nodeId: this.nodeId });

        const status = await this.withWarp10(warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                    fields: indexedEventFields,
                },
                macro: 'utapi/repairRecords',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0]} corrections`);
            this._pushMetrics({ created: status.result[0] });
        }
    }
}

module.exports = RepairTask;
