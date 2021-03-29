const config = require('../config');

const CacheClient = require('./client');
const { MemoryCache, RedisCache } = require('./backend');

const cacheTypes = {
    redis: conf => new RedisCache(conf),
    memory: () => new MemoryCache(),
};

function buildCacheClient(cacheConfig) {
    const { backend, counter, cache } = cacheConfig;
    return new CacheClient({
        cacheBackend: cacheTypes[backend](cache),
        counterBackend: cacheTypes[backend](counter),
    });
}

// TODO remove after all users have been moved to buildCacheClient
const { cacheBackend, counterBackend } = buildCacheClient({
    backend: config.cache.backend,
    cache: config.cache,
    counter: config.redis,
});

module.exports = {
    CacheClient,
    backends: {
        MemoryCache,
        RedisCache,
    },
    // TODO remove after all users have been moved to buildCacheClient
    client: new CacheClient({ cacheBackend, counterBackend }),
    buildCacheClient,
};
