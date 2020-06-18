const schema = require('../schema');

class MemoryCache {
    constructor() {
        this._data = {};
        this._shards = {};
        this._prefix = 'utapi';
    }

    // eslint-disable-next-line class-methods-use-this
    async connect() {
        return true;
    }

    // eslint-disable-next-line class-methods-use-this
    async disconnect() {
        return true;
    }

    async getKey(key) {
        return this._data[key];
    }

    async setKey(key, data) {
        this._data[key] = data;
        return true;
    }

    async addToShard(shard, event) {
        const metricKey = schema.getUtapiMetricKey(this._prefix, event);
        this._data[metricKey] = event;
        if (this._shards[shard]) {
            this._shards[shard].push(metricKey);
        } else {
            this._shards[shard] = [metricKey];
        }
        return true;
    }

    async getKeysInShard(shard) {
        return this._shards[shard] || [];
    }

    async fetchShard(shard) {
        if (this._shards[shard]) {
            return this._shards[shard].map(key => this._data[key]);
        }
        return [];
    }

    async deleteShardAndKeys(shard) {
        (this._shards[shard] || []).forEach(key => {
            delete this._data[key];
        });
        delete this._shards[shard];
        return true;
    }

    async getShards() {
        return Object.keys(this._shards);
    }

    async shardExists(shard) {
        return this._shards[shard.toString()] !== undefined;
    }
}

module.exports = MemoryCache;
