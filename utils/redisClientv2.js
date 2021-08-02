const RedisClient = require('../libV2/redis');

/**
* Creates a new Redis client instance
* @param {object} conf - redis configuration
* @param {string} conf.host - redis host
* @param {number} conf.port - redis port
* @param {string} [conf.password] - redis password (optional)
* @param {string} [conf.sentinelPassword] - sentinel password (optional)
* @param {Werelogs.Logger} log - Werelogs logger
* @return {Redis} - Redis client instance
*/
function redisClientv2(conf, log) {
    const client = new RedisClient({
        // disable offline queue
        enableOfflineQueue: false,
        // keep alive 3 seconds
        keepAlive: 3000,
        // Only emit `ready` if the server is able to accept commands
        enableReadyCheck: true,
        ...conf,
    });

    client.connect();
    client.on('error', err => log.trace('error with redis client', {
        error: err,
    }));
    return client;
}


module.exports = redisClientv2;
