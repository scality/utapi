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
            .logAsyncError(async () => {
                const res = await this._redis.set(key, value);
                return res === 'OK';
            }, 'error setting key in redis', { key });
    }

    async addToShard(shard, metric) {
        const logger = moduleLogger.with({ method: 'addToShard' });
        return logger
            .logAsyncError(async () => {
                const metricKey = schema.getUtapiMetricKey(this._prefix, metric);
                const shardKey = schema.getShardKey(this._prefix, shard);
                const shardMasterKey = schema.getShardMasterKey(this._prefix);
                logger.debug('adding metric to shard', { metricKey, shardKey });

                const [setResults, saddResults] = await this._redis
                    .multi([
                        ['set', metricKey, JSON.stringify(metric.getValue())],
                        ['sadd', shardKey, metricKey],
                        ['sadd', shardMasterKey, shardKey],
                    ])
                    .exec();

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
            }, 'error during redis command');
    }

    async getKeysInShard(shard) {
        return moduleLogger
            .with({ method: 'getKeysInShard' })
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                return this._redis.smembers(shardKey);
            }, 'error while fetching shard keys', { shard });
    }

    async fetchShard(shard) {
        return moduleLogger
            .with({ method: 'fetchShard' })
            .logAsyncError(async () => {
                const keys = await this.getKeysInShard(shard);
                if (!keys.length) {
                    return [];
                }
                return this._redis.mget(...keys);
            }, 'error while fetching shard data', { shard });
    }

    async deleteShardAndKeys(shard) {
        return moduleLogger
            .with({ method: 'deleteShardAndKeys' })
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                const shardMasterKey = schema.getShardMasterKey(this._prefix);
                const keys = await this.getKeysInShard(shard);
                return this._redis.multi([
                    ['del', shardKey, ...keys],
                    ['srem', shardMasterKey, shardKey],
                ]).exec();
            }, 'error while deleting shard', { shard });
    }

    async shardExists(shard) {
        return moduleLogger
            .with({ method: 'shardExists' })
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                const res = await this._redis.exists(shardKey);
                return res === 1;
            }, 'error while checking shard', { shard });
    }

    async getShards() {
        return moduleLogger
            .with({ method: 'getShards' })
            .logAsyncError(async () => {
                const shardMasterKey = schema.getShardMasterKey(this._prefix);
                return this._redis.smembers(shardMasterKey);
            }, 'error while fetching shards');
    }

    async updateCounters(metric) {
        return moduleLogger
            .with({ method: 'updateCounter' })
            .logAsyncError(async () => {
                if (metric.sizeDelta) {
                    const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, metric.account);
                    await this._redis.incrby(accountSizeKey, metric.sizeDelta);
                }
            }, 'error while updating metric counters');
    }

    async updateAccountCounterBase(account, size) {
        return moduleLogger
            .with({ method: 'updateAccountCounterBase' })
            .logAsyncError(async () => {
                const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
                const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
                await this._redis.mset(accountSizeKey, 0, accountSizeBaseKey, size);
                await this._redis.expire(accountSizeBaseKey, constants.counterBaseValueExpiration);
            }, 'error while updating metric counter base');
    }

    async fetchAccountSizeCounter(account) {
        return moduleLogger
            .with({ method: 'fetchAccountSizeCounter' })
            .logAsyncError(async () => {
                const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
                const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
                const [counter, base] = await this._redis.mget(accountSizeKey, accountSizeBaseKey);
                return [
                    counter !== null ? parseInt(counter, 10) : null,
                    base !== null ? parseInt(base, 10) : null,
                ];
            }, 'error fetching account size counters', { account });
    }
}

module.exports = RedisCache;
