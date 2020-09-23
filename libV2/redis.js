const EventEmitter = require('events');
const { callbackify, promisify } = require('util');
const IORedis = require('ioredis');
const uuid = require('uuid');

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
        this._inFlightTimeouts = this._useTimeouts ? {} : null;
        this._runningRedisProbe = null;
        this._isConnected = false;
        this._isReady = false;
    }

    connect(callback) {
        this._initClient(false);
        if (callback) {
            callback();
        }
    }

    disconnect(callback) {
        return asyncOrCallback(async () => {
            if (this._useTimeouts) {
                Object.values(this._inFlightTimeouts)
                    .forEach(clearTimeout);
            }
            await this._redis.quit();
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

    // eslint-disable-next-line class-methods-use-this
    _onError(error) {
        moduleLogger.error('error connecting to redis', { error });
        this.emit('error', error);
    }


    // eslint-disable-next-line class-methods-use-this
    _createCommandTimeout() {
        const timerId = uuid.v4();
        const cancel = () => {
            if (this._inFlightTimeouts[timerId]) {
                clearTimeout(this._inFlightTimeouts[timerId]);
                delete this._inFlightTimeouts[timerId];
            }
        };

        const timeout = new Promise((_, reject) => {
            const timer = setTimeout(
                () => {
                    moduleLogger.warn('redis command timed out');
                    delete this._inFlightTimeouts[timerId];
                    this.emit('timeout');
                    this._initClient();
                    reject(errors.OperationTimedOut);
                },
                COMMAND_TIMEOUT,
            );

            this._inFlightTimeouts[timerId] = timer;
            this.once('timeout', cancel);
        });

        return { timeout, cancel };
    }

    async _call(asyncFunc) {
        const funcPromise = asyncFunc(this._redis);
        if (!this._useTimeouts) {
            // If timeouts are disabled simply return the Promise
            return funcPromise;
        }

        const { timeout, cancel } = this._createCommandTimeout();

        try {
            const resp = await Promise.race([funcPromise, timeout]);
            cancel();
            // timeout always rejects so if we have `resp` it's from funcPromise
            return resp;
        } catch (error) {
            if (!(error.utapiError && error.OperationTimedOut)) {
                // If it isn't a timeout error, cleanup the pending timer
                cancel();
            }
            throw error;
        }
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
