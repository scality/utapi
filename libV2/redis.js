const EventEmitter = require('events');
const { callbackify, promisify } = require('util');
const IORedis = require('ioredis');
const { jsutil } = require('arsenal');
const BackOff = require('backo');
const { whilst } = require('async');

const errors = require('./errors');
const { LoggerContext, asyncOrCallback } = require('./utils');

const moduleLogger = new LoggerContext({
    module: 'redis',
});

const COMMAND_TIMEOUT = 10000;
const CONNECTION_TIMEOUT = 30000;

/**
* Creates a new Redis client instance
* @param {object} conf - redis configuration
* @param {string} conf.host - redis host
* @param {number} conf.port - redis port
* @param {string} [conf.password] - redis password (optional)
* @param {string} [conf.sentinelPassword] - sentinel password (optional)
* @param {Array<Object>} conf.sentinels - sentinels
* @param {Werelogs.Logger} log - Werelogs logger
* @return {Redis} - Redis client instance
*/
class RedisClient extends EventEmitter {
    constructor(options) {
        super();
        this._redisOptions = options;
        this._redis = null;
        // Controls the use of additional command timeouts
        // Only use if connecting to a sentinel cluster
        this._useTimeouts = options.sentinels !== undefined;
        this._inFlightTimeouts = this._useTimeouts ? new Set() : null;
        this._runningRedisProbe = null;
        this._isConnected = false;
        this._isReady = false;
    }

    connect(callback) {
        this._initClient(false);
        if (callback) {
            process.nextTick(callback);
        }
    }

    disconnect(callback) {
        return asyncOrCallback(async () => {
            if (this._useTimeouts) {
                Object.values(this._inFlightTimeouts)
                    .forEach(clearTimeout);
            }
            if (this._redis !== null) {
                await this._redis.quit();
                this._redis = null;
            }
        }, callback);
    }

    get isReady() {
        return this._isConnected && this._isReady;
    }

    _initClient(startProbe = true) {
        moduleLogger.debug('initializing redis client');
        if (this._redis !== null) {
            this._redis.off('connect', this._onConnect);
            this._redis.off('ready', this._onReady);
            this._redis.off('error', this._onError);
            this._redis.disconnect();
        }
        this._isConnected = false;
        this._isReady = false;
        this._redis = new IORedis(this._redisOptions);
        this._redis.on('connect', this._onConnect.bind(this));
        this._redis.on('ready', this._onReady.bind(this));
        this._redis.on('error', this._onError.bind(this));
        if (startProbe && this._runningRedisProbe === null) {
            this._runningRedisProbe = setInterval(this._probeRedis.bind(this), CONNECTION_TIMEOUT);
        }
    }

    _probeRedis() {
        if (this.isReady) {
            moduleLogger.debug('redis client is ready, clearing reinitialize interval');
            clearInterval(this._runningRedisProbe);
            this._runningRedisProbe = null;
        } else {
            moduleLogger.warn('redis client has failed to become ready, reinitializing');
            this._initClient();
        }
    }

    _onConnect() {
        this._isConnected = true;
        this.emit('connect');
    }

    _onReady() {
        this._isReady = true;
        this.emit('ready');
    }

    _onError(error) {
        this._isReady = false;
        moduleLogger.error('error connecting to redis', { error });
        if (this.listenerCount('error') > 0) {
            this.emit('error', error);
        }
    }

    _createCommandTimeout() {
        let timer;
        let onTimeout;

        const cancelTimeout = jsutil.once(() => {
            clearTimeout(timer);
            this.off('timeout', onTimeout);
            this._inFlightTimeouts.delete(timer);
        });

        const timeout = new Promise((_, reject) => {
            timer = setTimeout(this.emit.bind(this, 'timeout'), COMMAND_TIMEOUT);
            this._inFlightTimeouts.add(timer);
            onTimeout = () => {
                moduleLogger.warn('redis command timed out');
                cancelTimeout();
                this._initClient();
                reject(errors.OperationTimedOut);
            };
            this.once('timeout', onTimeout);
        });

        return { timeout, cancelTimeout };
    }

    async _call(asyncFunc) {
        const start = Date.now();
        const { connectBackoff } = this._redisOptions.retry || {};
        const backoff = new BackOff(connectBackoff);
        const timeoutMs = (connectBackoff || {}).deadline || 2000;
        let retried = false;

        return new Promise((resolve, reject) => {
            whilst(
                next => { // WARNING: test is asynchronous in `async` v3
                    if (!connectBackoff && !this.isReady) {
                        moduleLogger.warn('redis not ready and backoff is not configured');
                    }
                    process.nextTick(next, null, !!connectBackoff && !this.isReady);
                },
                next => {
                    retried = true;

                    if ((Date.now() - start) > timeoutMs) {
                        moduleLogger.error('redis still not ready after max wait, giving up', { timeoutMs });
                        return next(errors.InternalError.customizeDescription(
                            'redis client is not ready',
                        ));
                    }

                    const backoffDurationMs = backoff.duration();
                    moduleLogger.error('redis not ready, retrying', { backoffDurationMs });

                    return setTimeout(next, backoffDurationMs);
                },
                err => {
                    if (err) {
                        return reject(err);
                    }

                    if (retried) {
                        moduleLogger.info('redis connection recovered', {
                            recoveryOverheadMs: Date.now() - start,
                        });
                    }

                    const funcPromise = asyncFunc(this._redis);
                    if (!this._useTimeouts) {
                        // If timeouts are disabled simply return the Promise
                        return resolve(funcPromise);
                    }

                    const { timeout, cancelTimeout } = this._createCommandTimeout();

                    try {
                        // timeout always rejects so we can just return
                        return resolve(Promise.race([funcPromise, timeout]));
                    } finally {
                        cancelTimeout();
                    }
                },
            );
        });
    }

    call(func, callback) {
        if (callback !== undefined) {
            // If a callback is provided `func` is assumed to also take a callback
            // and is converted to a promise using promisify
            return callbackify(this._call.bind(this))(promisify(func), callback);
        }
        return this._call(func);
    }
}

module.exports = RedisClient;
