import Redis from 'ioredis';

function _moduleCheck() {
    try {
        require.resolve('hiredis');
    } catch (e) {
        return false;
    }
    return true;
}

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
        // dropBufferSupport option performs better with
        // hiredis (native redis module) and not with the default
        // javascript redis parser
        dropBufferSupport: _moduleCheck(),
    }, config));
    redisClient.on('error', err => log.trace('error with redis client', {
        error: err,
    }));
    return redisClient;
}
