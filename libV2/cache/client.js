const { shardFromTimestamp } = require('../utils');

class CacheClient {
    constructor(config) {
        this._prefix = config.prefix || 'utapi';
        this._cacheBackend = config.cacheBackend;
        this._counterBackend = config.counterBackend;
    }

    async connect() {
        return Promise.all([
            this._cacheBackend.connect(),
            this._counterBackend.connect(),
        ]);
    }

    async disconnect() {
        return Promise.all([
            this._cacheBackend.disconnect(),
            this._counterBackend.disconnect(),
        ]);
    }

    async pushMetric(metric) {
        const shard = shardFromTimestamp(metric.timestamp);
        if (!(await this._cacheBackend.addToShard(shard, metric))) {
            return false;
        }
        await this._counterBackend.updateCounters(metric);
        return true;
    }

    async getMetricsForShard(shard) {
        return this._cacheBackend.fetchShard(shard);
    }

    async deleteShard(shard) {
        return this._cacheBackend.deleteShardAndKeys(shard);
    }

    async shardExists(shard) {
        return this._cacheBackend.shardExists(shard);
    }

    async getShards() {
        return this._cacheBackend.getShards();
    }

    async updateAccountCounterBase(account, size) {
        return this._counterBackend.updateAccountCounterBase(account, size);
    }

    async fetchAccountSizeCounter(account) {
        return this._counterBackend.fetchAccountSizeCounter(account);
    }
}

module.exports = CacheClient;
