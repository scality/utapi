const schema = require('../schema');
const constants = require('../../constants');

/**
 * Returns null iff the value is undefined.
 * Returns the passed value otherwise.
 *
 * @param {*} value - Any value
 * @returns {*} - Passed value or null
 */
function orNull(value) {
    return value === undefined ? null : value;
}

class MemoryCache {
    constructor() {
        this._data = {};
        this._shards = {};
        this._prefix = 'utapi';
        this._expirations = {};
    }

    // eslint-disable-next-line class-methods-use-this
    async connect() {
        return true;
    }

    // eslint-disable-next-line class-methods-use-this
    async disconnect() {
        Object.values(this._expirations).forEach(clearTimeout);
        return true;
    }

    _expireKey(key, delay) {
        if (this._expirations[key]) {
            clearTimeout(this._expirations[key]);
        }
        this._expirations[key] = setTimeout(() => delete this._data[key], delay * 1000);
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
        console.log(`MEM: ${metricKey}`)
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

    async updateCounters(metric) {
        if (metric.sizeDelta) {
            const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, metric.account);
            this._data[accountSizeKey] = (this._data[accountSizeKey] || 0) + metric.sizeDelta;
        }
    }

    async updateAccountCounterBase(account, size) {
        const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
        const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
        this._data[accountSizeKey] = 0;
        this._data[accountSizeBaseKey] = size;
        this._expireKey(accountSizeBaseKey, constants.counterBaseValueExpiration);
    }

    async fetchAccountSizeCounter(account) {
        const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
        const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
        return [orNull(this._data[accountSizeKey]), orNull(this._data[accountSizeBaseKey])];
    }
}

module.exports = MemoryCache;
