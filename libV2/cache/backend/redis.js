const IORedis = require('ioredis');
const schema = require('../schema');

const { LoggerContext } = require('../../utils');
const constants = require('../../constants');

const moduleLogger = new LoggerContext({
    module: 'cache.backend.redis.RedisCache',
});

class RedisCache {
    constructor(options, prefix) {
        this._redis = null;
        this._options = options;
        this._prefix = prefix || 'utapi';
    }

    async connect() {
        moduleLogger.debug('Connecting to redis...');
        this._redis = new IORedis(this._options);
        this._redis
            .on('error', err =>
                moduleLogger.error(`error connecting to redis ${err}`))
            .on('connect', () => moduleLogger.debug('connected to redis'));
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
            this._redis = null;
        } else {
            logger.debug('disconnect called but no connection to redis found');
        }
    }

    async getKey(key) {
        return moduleLogger
            .with({ method: 'getKey' })
            .logAsyncError(() => this._redis.get(key),
                'error fetching key from redis', { key });
    }

    async setKey(key, value) {
        return moduleLogger
            .with({ method: 'setKey' })
            .error()
            .logAsyncError(async () => {
                const res = await this._redis.set(key, value);
                return res === 'OK';
            }, 'error setting key in redis', { key });
    }

    async addToShard(shard, metric) {
        const metricKey = schema.getUtapiMetricKey(this._prefix, metric);
        const shardKey = schema.getShardKey(this._prefix, shard);
        const shardMasterKey = schema.getShardMasterKey(this._prefix);
        const logger = moduleLogger.with({ method: 'addToShard' });
        logger.debug('adding metric to shard', { metricKey, shardKey });

        let setResults;
        let saddResults;
        try {
            [setResults, saddResults] = await this._redis
                .multi([
                    ['set', metricKey, JSON.stringify(metric.getValue())],
                    ['sadd', shardKey, metricKey],
                    ['sadd', shardMasterKey, shardKey],
                ])
                .exec();
        } catch (error) {
            logger.error('error during redis command', { error });
            throw error;
        }

        let success = true;
        if (setResults[1] !== 'OK') {
            moduleLogger.error('failed to set metric key', {
                metricKey,
                shardKey,
                res: setResults[1],
            });
            success = false;
        }

        if (saddResults[1] !== 1) {
            moduleLogger.error('metric key already present in shard', {
                metricKey,
                shardKey,
                res: saddResults[1],
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
        const shardMasterKey = schema.getShardMasterKey(this._prefix);
        try {
            const keys = await this.getKeysInShard(shard);
            return this._redis.multi([
                ['del', shardKey, ...keys],
                ['srem', shardMasterKey, shardKey],
            ]).exec();
        } catch (error) {
            moduleLogger
                .with({ method: 'deleteShardAndKeys' })
                .error('error while deleting shard', { shard, error });
            throw error;
        }
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

    async getShards() {
        try {
            const shardMasterKey = schema.getShardMasterKey(this._prefix);
            return this._redis.smembers(shardMasterKey);
        } catch (error) {
            moduleLogger
                .with({ method: 'getShards' })
                .error('error while fetching shards', { error });
            throw error;
        }
    }

    async updateCounters(metric) {
        if (metric.sizeDelta) {
            try {
                const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, metric.account);
                await this._redis.incrby(accountSizeKey, metric.sizeDelta);
            } catch (error) {
                moduleLogger
                    .with({ method: 'updateCounter' })
                    .error('error while updating metric counters', { error });
                throw error;
            }
        }
    }

    async updateAccountCounterBase(account, size) {
        try {
            const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
            const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
            await this._redis.mset(accountSizeKey, 0, accountSizeBaseKey, size);
            await this._redis.expire(accountSizeBaseKey, constants.counterBaseValueExpiration);
        } catch (error) {
            moduleLogger
                .with({ method: 'updateAccountCounterBase' })
                .error('error while updating metric counter base', { error });
            throw error;
        }
    }

    async fetchAccountSizeCounter(account) {
        const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
        const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
        const [counter, base] = await this._redis.mget(accountSizeKey, accountSizeBaseKey);
        return [
            counter !== null ? parseInt(counter, 10) : null,
            base !== null ? parseInt(base, 10) : null,
        ];
    }
}

module.exports = RedisCache;
