const assert = require('assert');
const BaseTask = require('./BaseTask');
const { UtapiMetric } = require('../models');
const config = require('../config');
const { LoggerContext, shardFromTimestamp } = require('..//utils');
const { shardIngestLagSecs } = require('../constants');

const logger = new LoggerContext({
    module: 'IngestShard',
});

class IngestShardTask extends BaseTask {
    constructor(...options) {
        super(...options);
        this._defaultSchedule = config.ingestionSchedule;
    }

    async _execute(timestamp) {
        const endShard = shardFromTimestamp(timestamp - (shardIngestLagSecs * 1000000));
        logger.debug('ingesting shards', { endShard });

        const available = await this._cache.getShards();
        const toIngest = available
            .map(key => key.split(':')[2])
            .filter(key => parseInt(key, 10) <= endShard);

        if (!toIngest.length) {
            logger.debug('no shard available to ingest');
            return;
        }

        await Promise.all(toIngest.map(
            async shard => {
                if (await this._cache.shardExists(shard)) {
                    const metrics = await this._cache.getMetricsForShard(shard);
                    if (metrics.length) {
                        logger.info(`Ingesting ${metrics.length} events from shard`, { shard });
                        const records = metrics
                            .map(m => new UtapiMetric(JSON.parse(m)));
                        const status = await this._warp10.ingest('utapi.event', records);
                        assert.strictEqual(status, records.length);
                    } else {
                        logger.debug('No events found in shard, cleaning up');
                    }
                    await this._cache.deleteShard(shard);
                } else {
                    logger.warn('shard does not exist', { shard });
                }
            },
        ));
    }
}

module.exports = IngestShardTask;
