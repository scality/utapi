const config = require('../config');

const CacheClient = require('./client');
const { MemoryCache, RedisCache } = require('./backend');

let backend;
switch (config.cacheBackend) {
case 'memory':
    backend = new MemoryCache();
    break;

case 'redis':
    backend = new RedisCache(config.redis);
    break;

default:
    throw Error(`Invalid cache backend ${config.cacheBackend}`);
}

module.exports = {
    CacheClient,
    backends: {
        MemoryCache,
        RedisCache,
    },
    client: new CacheClient({ backend }),
};
