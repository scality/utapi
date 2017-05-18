import assert from 'assert';
import async from 'async';
import { scheduleJob } from 'node-schedule';
import UtapiClient from './UtapiClient';
import Datastore from './Datastore';
import redisClient from '../utils/redisClient';
import safeJsonParse from '../utils/safeJsonParse';
import { Logger } from 'werelogs';

export default class UtapiReplay {
    /**
     * Create a UtapiReplay
     * @param {object} [config] - The configuration of UtapiReplay
     * @param {object} [config.log] - Object defining the level and dumplevel of
     * the log
     * @param {object} [config.redis] - Object defining the host and port of the
     * Redis datastore
     * @param {object} [config.localCache] - Object defining the host and port
     * of the local cache datastore
     * @param {number} [config.batchSize] - The batch size to get metrics from
     * Redis datastore
     * @param {string} [config.replaySchedule] - The Cron-style schedule at
     * which the replay job should run
     */
    constructor(config) {
        this.log = new Logger('UtapiReplay', {
            level: 'info',
            dump: 'error',
        });
        this.replaySchedule = config.replaySchedule;
        this.batchSize = config.batchSize;
        this.replayLock = false;
        this.disableReplay = true;

        if (config) {
            if (config.log) {
                this.log = new Logger('UtapiReplay', {
                    level: config.log.logLevel,
                    dump: config.log.dumpLevel,
                });
            }
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
     * Sets the replay lock.
     * @param {boolean} isLocked - The value to set `this.replayLock`.
     * @param {callback} cb - Callback to call.
     * @return {UtapiReplay} this - UtapiReplay instance.
     */
    _setReplayLock(isLocked) {
        this.replayLock = isLocked;
        return this;
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
                return this._setReplayLock(false);
            }
            this.log.info(`replay job completed: pushed ${listLen} metrics`);
            return this._setReplayLock(false);
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
                return this._setReplayLock(false);
            }
            if (res > 0) {
                return this._getCachedMetrics(res);
            }
            this.log.info('replay job completed: no cached metrics found');
            return this._setReplayLock(false);
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
        const replay = scheduleJob(this.replaySchedule, () => {
            // Ensure no elements are still being pushed by a prior replay.
            if (!this.replayLock) {
                this._setReplayLock(true);
                return this._checkLocalCache();
            }
            return undefined;
        });
        replay.on('scheduled', date =>
            this.log.info(`replay job started: ${date}`));
        this.log.info('enabled utapi replay scheduler', {
            schedule: this.replaySchedule,
        });
        return this;
    }
}
