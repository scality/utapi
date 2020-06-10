const schema = require('./schema');
const { shardFromTimestamp } = require('../utils');

class CacheClient {
    constructor(config) {
        this._prefix = config.prefix || 'utapi';
        this._backend = config.backend;
    }

    async connect() {
        return this._backend.connect();
    }

    async disconnect() {
        return this._backend.disconnect();
    }

    async pushMetric(metric) {
        const shard = shardFromTimestamp(metric.timestamp);
        return this._backend.addToShard(shard, metric);
    }

    async getMetricsForShard(shard) {
        return this._backend.fetchShard(shard);
    }

    async deleteShard(shard) {
        return this._backend.deleteShardAndKeys(shard);
    }

    async shardExists(shard) {
        return this._backend.shardExists(shard);
    }
}

module.exports = CacheClient;
