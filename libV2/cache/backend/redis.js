const RedisClient = require('../../redis');
const schema = require('../schema');

const { LoggerContext, streamToAsyncIter } = require('../../utils');
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
        this._redis = new RedisClient(this._options);
        this._redis.connect();
        return true;
    }

    async disconnect() {
        const logger = moduleLogger.with({ method: 'disconnect' });
        if (this._redis) {
            try {
                logger.debug('closing connection to redis');
                await this._redis.disconnect();
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
            .logAsyncError(() => this._redis.call(redis => redis.get(key)),
                'error fetching key from redis', { key });
    }

    async setKey(key, value) {
        return moduleLogger
            .with({ method: 'setKey' })
            .logAsyncError(async () => {
                const res = await this._redis.call(redis => redis.set(key, value));
                return res === 'OK';
            }, 'error setting key in redis', { key });
    }

    async addToShard(shard, metric) {
        const logger = moduleLogger.with({ method: 'addToShard' });
        return logger
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                const shardMasterKey = schema.getShardMasterKey(this._prefix);
                logger.debug('adding metric to shard', { uuid: metric.uuid, shardKey });

                const [setResults, saddResults] = await this._redis
                    .call(redis => redis
                        .multi([
                            ['hset', shardKey, metric.uuid, JSON.stringify(metric.getValue())],
                            ['sadd', shardMasterKey, shardKey],
                        ])
                        .exec());

                if (setResults[0] !== 1) {
                    moduleLogger.error('failed to set metric key', {
                        uuid: metric.uuid,
                        shardKey,
                        res: setResults[0],
                    });
                    return false;
                }

                if (saddResults[1] !== 1) {
                    moduleLogger.trace('shard key already present in master', {
                        shardKey,
                        res: saddResults[1],
                    });
                }
                return true;
            }, 'error during redis command');
    }

    async getKeysInShard(shard) {
        return moduleLogger
            .with({ method: 'getKeysInShard' })
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                return this._redis.call(redis => redis.smembers(shardKey));
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
                return this._redis.call(redis => redis.mget(...keys));
            }, 'error while fetching shard data', { shard });
    }

    async deleteShardAndKeys(shard) {
        return moduleLogger
            .with({ method: 'deleteShardAndKeys' })
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                const shardMasterKey = schema.getShardMasterKey(this._prefix);
                const keys = await this.getKeysInShard(shard);
                return this._redis.call(
                    redis => redis.multi([
                        ['del', shardKey, ...keys],
                        ['srem', shardMasterKey, shardKey],
                    ]).exec(),
                );
            }, 'error while deleting shard', { shard });
    }

    async shardExists(shard) {
        return moduleLogger
            .with({ method: 'shardExists' })
            .logAsyncError(async () => {
                const shardKey = schema.getShardKey(this._prefix, shard);
                const res = await this._redis.call(redis => redis.exists(shardKey));
                return res === 1;
            }, 'error while checking shard', { shard });
    }

    async getShards() {
        return moduleLogger
            .with({ method: 'getShards' })
            .logAsyncError(async () => {
                const shardMasterKey = schema.getShardMasterKey(this._prefix);
                return this._redis.call(redis => redis.smembers(shardMasterKey));
            }, 'error while fetching shards');
    }

    async updateCounters(metric) {
        return moduleLogger
            .with({ method: 'updateCounter' })
            .logAsyncError(async () => {
                if (metric.sizeDelta) {
                    const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, metric.account);
                    await this._redis.call(redis => redis.incrby(accountSizeKey, metric.sizeDelta));
                }
            }, 'error while updating metric counters');
    }

    async updateAccountCounterBase(account, size) {
        return moduleLogger
            .with({ method: 'updateAccountCounterBase' })
            .logAsyncError(async () => {
                const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
                const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
                await this._redis.call(async redis => {
                    await redis.mset(accountSizeKey, 0, accountSizeBaseKey, size);
                    await redis.expire(accountSizeBaseKey, constants.counterBaseValueExpiration);
                });
            }, 'error while updating metric counter base');
    }

    async fetchAccountSizeCounter(account) {
        return moduleLogger
            .with({ method: 'fetchAccountSizeCounter' })
            .logAsyncError(async () => {
                const accountSizeKey = schema.getAccountSizeCounterKey(this._prefix, account);
                const accountSizeBaseKey = schema.getAccountSizeCounterBaseKey(this._prefix, account);
                const [counter, base] = await this._redis.call(redis => redis.mget(accountSizeKey, accountSizeBaseKey));
                return [
                    counter !== null ? parseInt(counter, 10) : null,
                    base !== null ? parseInt(base, 10) : null,
                ];
            }, 'error fetching account size counters', { account });
    }
}

module.exports = RedisCache;
