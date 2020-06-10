const IORedis = require('ioredis');
const schema = require('../schema');

const { LoggerContext } = require('../../utils');

const moduleLogger = new LoggerContext({ module: 'cache.backend.redis.RedisCache' });

class RedisCache {
    constructor(options) {
        this._redis = null;
        this._options = options;
        Object.assign(this._options, options);
        this._prefix = 'utapi';
    }

    async connect() {
        moduleLogger.debug('Connecting to redis...');
        this._redis = new IORedis(this._options);
        this._redis
            .on('error', err => moduleLogger.error(`error connecting to redis ${err}`))
            .on('connect', () => moduleLogger.log('connected to redis'));
        return true;
    }

    async disconnect() {
        if (this._redis) {
            moduleLogger.debug('closing connection to redis');
            await this._redis.quit();
            await this._redis.disconnect();
            this._reds = null;
        } else {
            moduleLogger.debug('disconnect called but no connection to redis found');
        }
    }

    async getKey(key) {
        return this._redis.get(key);
    }

    async setKey(key, value) {
        return (await this._redis.set(key, value)) === 'OK';
    }

    async addToShard(shard, metric) {
        const metricKey = schema.getUtapiMetricKey(this._prefix, metric);
        const shardKey = schema.getShardKey(this._prefix, shard);
        const logger = moduleLogger.from({ method: 'addToShard' });
        logger.debug('adding metric to shard', { metricKey, shardKey });

        let results;
        try {
            results = await this._redis
                .multi([
                    ['set', metricKey, JSON.stringify(metric.getValue())],
                    ['sadd', shardKey, metricKey],
                ])
                .exec();
        } catch (err) {
            moduleLogger.error()
        }

        let success = true;
        // Check the results of our set
        if (results[0][1] !== 'OK') {
            moduleLogger.error('failed to set metric key', { metricKey, shardKey });
            success = false;
        }

        // Check the results of our sadd
        if (results[1][1] !== 1) {
            moduleLogger.error('failed to add metric key to shard', { metricKey, shardKey });
            success = false;
        }
        return success;
    }

    async getKeysInShard(shard) {
        const shardKey = schema.getShardKey(this._prefix, shard);
        return this._redis.smembers(shardKey);
    }

    async fetchShard(shard) {
        const keys = await this.getKeysInShard(shard);
        if (!keys.length) {
            return [];
        }
        return this._redis.mget(...keys);
    }

    async deleteShardAndKeys(shard) {
        const shardKey = schema.getShardKey(this._prefix, shard);
        const keys = await this.getKeysInShard(shard);
        return this._redis.del(shardKey, ...keys);
    }

    async getShards() {
        return Object.keys(this._shards);
    }

    async shardExists(shard) {
        const shardKey = schema.getShardKey(this._prefix, shard);
        return (await this._redis.exists(shardKey)) === 1;
    }
}

module.exports = RedisCache;
