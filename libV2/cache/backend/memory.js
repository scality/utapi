

class MemoryCache {
    constructor() {
        this._data = {};
        this._shards = {};
    }

    async getKey(key) {
        return this._data[key];
    }

    async setKey(key, data) {
        this._data[key] = data;
        return true;
    }

    async addToShard(shard, key) {
        if (!!this._shards[shard]) {
            this._shards[shard].push(key);
        } else {
            this._shards[shard] = [key];
        }
        return true;
    }

    async getKeysInShard(shard) {
        if (!!this._shards[shard]) {
            return this._shards[shard];
        } else {
            return [];
        }
    }

    async deleteShardAndKeys(shard) {
        (this._shards[shard] || []).forEach(key => {
            this._data[key] = undefined;
        })
        this._shards[shard] = undefined;
        return true;
    }

    async getShards() {
        return Object.keys(this._shards);
    }
}

module.exports = MemoryCache;