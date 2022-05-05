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
            ...options,
            enableMetrics: config.metrics.enabled,
            metricsHost: config.metrics.host,
            metricsPort: config.metrics.snapshotPort,
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
            this._metricsHandlers.created.inc(status.result[0]);
        }
    }
}

module.exports = CreateSnapshot;
