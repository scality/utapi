const IORedis = require('ioredis');
const schema = require('../schema');

const { LoggerContext } = require('../../utils');

const moduleLogger = new LoggerContext({
    module: 'cache.backend.redis.RedisCache',
});

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
            .on('error', err =>
                moduleLogger.error(`error connecting to redis ${err}`))
            .on('connect', () => moduleLogger.log('connected to redis'));
        return true;
    }

    async disconnect() {
        const logger = moduleLogger.with({ method: 'disconnect' });
        if (this._redis) {
            try {
                logger.debug('closing connection to redis');
                await this._redis.quit();
            } catch (error) {
                logger.error('error while closing connection to redis', {
                    error,
                });
                throw error;
            }
            this._reds = null;
        } else {
            logger.debug('disconnect called but no connection to redis found');
        }
    }

    async getKey(key) {
        try {
            return this._redis.get(key);
        } catch (error) {
            moduleLogger
                .with({ method: 'getKey' })
                .error('error fetching key from redis', { key });
            throw error;
        }
    }

    async setKey(key, value) {
        try {
            const res = await this._redis.set(key, value);
            return res === 'OK';
        } catch (error) {
            moduleLogger
                .with({ method: 'setKey' })
                .error('error setting key in redis', { key });
            throw error;
        }
    }

    async addToShard(shard, metric) {
        const metricKey = schema.getUtapiMetricKey(this._prefix, metric);
        const shardKey = schema.getShardKey(this._prefix, shard);
        const logger = moduleLogger.with({ method: 'addToShard' });
        logger.debug('adding metric to shard', { metricKey, shardKey });

        let results;
        try {
            results = await this._redis
                .multi([
                    ['set', metricKey, JSON.stringify(metric.getValue())],
                    ['sadd', shardKey, metricKey],
                ])
                .exec();
        } catch (error) {
            logger.error('error during redis command', { error });
            throw error;
        }

        let success = true;
        // Check the results of our set
        if (results[0][1] !== 'OK') {
            moduleLogger.error('failed to set metric key', {
                metricKey,
                shardKey,
            });
            success = false;
        }

        // Check the results of our sadd
        if (results[1][1] !== 1) {
            moduleLogger.error('failed to add metric key to shard', {
                metricKey,
                shardKey,
            });
            success = false;
        }
        return success;
    }

    async getKeysInShard(shard) {
        try {
            const shardKey = schema.getShardKey(this._prefix, shard);
            return this._redis.smembers(shardKey);
        } catch (error) {
            moduleLogger
                .with({ method: 'getKeysInShard' })
                .error('error while fetching shard keys', { shard, error });
            throw error;
        }
    }

    async fetchShard(shard) {
        try {
            const keys = await this.getKeysInShard(shard);
            if (!keys.length) {
                return [];
            }
            return this._redis.mget(...keys);
        } catch (error) {
            moduleLogger
                .with({ method: 'fetchShard' })
                .error('error while fetching shard data', { shard, error });
            throw error;
        }
    }

    async deleteShardAndKeys(shard) {
        const shardKey = schema.getShardKey(this._prefix, shard);
        try {
            const keys = await this.getKeysInShard(shard);
            return this._redis.del(shardKey, ...keys);
        } catch (error) {
            moduleLogger
                .with({ method: 'deleteShardAndKeys' })
                .error('error while deleting shard', { shard, error });
            throw error;
        }
    }

    async getShards() {
        return Object.keys(this._shards);
    }

    async shardExists(shard) {
        const shardKey = schema.getShardKey(this._prefix, shard);
        try {
            const res = await this._redis.exists(shardKey);
            return res === 1;
        } catch (error) {
            moduleLogger
                .with({ method: 'shardExists' })
                .error('error while checking shard', { shard, error });
            throw error;
        }
    }
}

module.exports = RedisCache;
