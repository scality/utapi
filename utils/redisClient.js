import Redis from 'ioredis';

/**
* Creates a new Redis client instance
* @param {object} config - redis configuration
* @param {Werelogs} log - Werelogs logger
* @return {Redis} - Redis client instance
*/
export default function redisClient(config, log) {
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
