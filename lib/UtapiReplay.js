const assert = require('assert');
const async = require('async');
const { scheduleJob } = require('node-schedule');
const UtapiClient = require('./UtapiClient');
const Datastore = require('./Datastore');
const redisClient = require('../utils/redisClient');
const safeJsonParse = require('../utils/safeJsonParse');
const werelogs = require('werelogs');

// Every five minutes. Cron-style scheduling used by node-schedule.
const REPLAY_SCHEDULE = '*/5 * * * *';
// Fifteen minutes. The time to live for a replay lock.
const TTL = 60 * 15;
const BATCH_SIZE = 10;

class UtapiReplay {
    /**
     * Create a UtapiReplay
     * @param {object} [config] - The configuration of UtapiReplay
     * @param {werelogs.API} [config.logApi] - object providing a constructor
     *                                         function for the Logger object
     * @param {object} [config.redis] - Object defining the host, port and
     * password(optional) of the Redis datastore
     * @param {object} [config.localCache] - Object defining the host, port and
     * password(optional) of the local cache datastore
     * @param {number} [config.batchSize] - The batch size to get metrics from
     * Redis datastore
     * @param {string} [config.replaySchedule] - The Cron-style schedule at
     * which the replay job should run
     */
    constructor(config) {
        this.log = new (config.logApi || werelogs).Logger('UtapiReplay');
        this.replaySchedule = REPLAY_SCHEDULE;
        this.batchSize = BATCH_SIZE;
        this.disableReplay = true;

        if (config) {
            const message = 'missing required property in UtapiReplay ' +
                'configuration';
            assert(config.redis, `${message}: redis`);
            assert(config.localCache, `${message}: localCache`);
            this.utapiClient = new UtapiClient(config);
            this.localCache = new Datastore()
                .setClient(redisClient(config.localCache, this.log));
            if (config.replaySchedule) {
                this.replaySchedule = config.replaySchedule;
            }
            if (config.batchSize) {
                this.batchSize = config.batchSize;
            }
            this.disableReplay = false;
        }
    }

    /**
     * Set the replay lock key.
     * @return {undefined}
     */
    _setLock() {
        return this.localCache.setExpire('s3:utapireplay:lock', 'true', TTL);
    }

   /**
    * Delete the replay lock key. If there is an error during this command, do
    * not handle it as the lock will expire after the value of `TTL`.
    * @return {undefined}
    */
    _removeLock() {
        return this.localCache.del('s3:utapireplay:lock');
    }

    /**
     * Validates that all required items can be retrived from the JSON object.
     * @param {string} data - JSON of list element from local cache.
     * @return {boolean} Returns `true` if object is valid, `false` otherwise.
     */
    _validateElement(data) {
        const { action, reqUid, params, timestamp } = data;
        if (!action || !reqUid || !params || !timestamp) {
            this.log.fatal('missing required parameter in element',
                { method: 'UtapiReplay._validateElement' });
            return false;
        }
        return true;
    }

    /**
     * Pushes list elements using the array returned by nodeio.
     * @param {array[]} metricsArr - The array returned by nodeio containing the
     * an array of an error code and value for each element in the cache list.
     * @param {callback} cb - Callback to call.
     * @return {function} async.each - Iterates through all array elements.
     */
    _pushCachedMetrics(metricsArr, cb) {
        return async.each(metricsArr, (arr, next) => {
            const actionErr = arr[0];
            const element = arr[1];
            // If there is an error in one of the RPOP commands, it remains in
            // the local cache list, so do not handle that element.
            if (!actionErr && element) {
                const { error, result } = safeJsonParse(element);
                if (error) {
                    this.log.error('cannot parse element into JSON',
                        { method: 'UtapiReplay._pushCachedMetrics' });
                    return next(error);
                }
                if (!this._validateElement(result)) {
                    return next();
                }
                this.log.trace('pushing metric with utapiClient::pushMetric',
                    { method: 'UtapiReplay._pushCachedMetrics' });
                const { action, reqUid, params } = result;
                // We do not pass the callback to pushMetric since UtapiClient
                // will handle pushing it to local cache if internal error.
                this.utapiClient.pushMetric(action, reqUid, params);
            }
            return next();
        }, err => cb(err));
    }

    /**
     * Gets and removes all elements from the local cache list.
     * @param {number} listLen - The length of the local cache list.
     * @return {function} async.timesSeries - Iterates through all list
     * elements.
     */
    _getCachedMetrics(listLen) {
        const count = Math.ceil(listLen / this.batchSize);
        return async.timesSeries(count, (n, next) => {
            // We create the array each time because ioredis modifies it.
            const cmds = [];
            for (let i = 0; i < this.batchSize; i++) {
                cmds.push(['rpop', 's3:utapireplay']);
            }
            return this.localCache.pipeline(cmds, (err, res) => {
                if (err) {
                    return next(err);
                }
                return this._pushCachedMetrics(res, next);
            });
        }, err => {
            if (err) {
                this.log.error('cannot push element from cache list', {
                    method: 'UtapiReplay._getCachedMetrics',
                    error: err,
                });
                this.log.info(`replay job completed: ${err}`);
                return this._removeLock();
            }
            this.log.info(`replay job completed: pushed ${listLen} metrics`);
            return this._removeLock();
        });
    }

    /**
     * Checks local cache to determine if any action has been logged.
     * @return {function} this.localCache.llen - Gets the length of the list
     * in local cache.
     */
    _checkLocalCache() {
        return this.localCache.llen('s3:utapireplay', (err, res) => {
            if (err) {
                this.log.error('cannot get length of localCache list', {
                    method: 'UtapiReplay._getCachedMetrics',
                    error: err.stack || err,
                });
                return this._removeLock();
            }
            if (res > 0) {
                return this._getCachedMetrics(res);
            }
            this.log.info('replay job completed: no cached metrics found');
            return this._removeLock();
        });
    }

    /**
     * Starts the replay job at the given job schedule.
     * @return {UtapiReplay} this - UtapiReplay instance.
     */
    start() {
        if (this.disableReplay) {
            this.log.info('disabled utapi replay scheduler');
            return this;
        }
        const replay = scheduleJob(this.replaySchedule, () =>
            this._setLock()
                .then(res => {
                    // If `res` is not `null`, there is no pre-existing lock.
                    if (res) {
                        return this._checkLocalCache();
                    }
                    return undefined;
                }));
        replay.on('scheduled', date =>
            this.log.info(`replay job started: ${date}`));
        this.log.info('enabled utapi replay scheduler', {
            schedule: this.replaySchedule,
        });
        return this;
    }
}

module.exports = UtapiReplay;
