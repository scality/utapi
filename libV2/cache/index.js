const config = require('../config');

const CacheClient = require('./client');
const { MemoryCache, RedisCache } = require('./backend');

const cacheTypes = {
    redis: () => new RedisCache(config.cache),
    memory: () => new MemoryCache(),
};

const backend = cacheTypes[config.cache.backend]();

module.exports = {
    CacheClient,
    backends: {
        MemoryCache,
        RedisCache,
    },
    client: new CacheClient({ backend }),
};
