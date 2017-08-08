const Redis = require('ioredis');

/**
* Creates a new Redis client instance
* @param {object} config - redis configuration
* @param {string} config.host - redis host
* @param {number} config.port - redis port
* @param {string} [config.password] - redis password (optional)
* @param {Werelogs.Logger} log - Werelogs logger
* @return {Redis} - Redis client instance
*/
function redisClient(config, log) {
    const redisClient = new Redis(Object.assign({
        // disable offline queue
        enableOfflineQueue: false,
        // keep alive 3 seconds
        keepAlive: 3000,
    }, config));
    redisClient.on('error', err => log.trace('error with redis client', {
        error: err,
    }));
    return redisClient;
}

module.exports = redisClient;
