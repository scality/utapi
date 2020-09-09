const config = require('../config');

const CacheClient = require('./client');
const { MemoryCache, RedisCache } = require('./backend');

const cacheTypes = {
    redis: conf => new RedisCache(conf),
    memory: () => new MemoryCache(),
};

const cacheBackend = cacheTypes[config.cache.backend](config.cache);
const counterBackend = cacheTypes[config.cache.backend](config.redis);

module.exports = {
    CacheClient,
    backends: {
        MemoryCache,
        RedisCache,
    },
    client: new CacheClient({ cacheBackend, counterBackend }),
};
