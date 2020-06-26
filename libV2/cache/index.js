const config = require('../config');

const CacheClient = require('./client');
const { MemoryCache, RedisCache } = require('./backend');

const cacheTypes = {
    redis: () => new RedisCache(config.redis),
    memory: () => new MemoryCache(),
};

const backend = cacheTypes[config.cacheBackend]();

module.exports = {
    CacheClient,
    backends: {
        MemoryCache,
        RedisCache,
    },
    client: new CacheClient({ backend }),
};
