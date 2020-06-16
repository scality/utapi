/* eslint-disable prefer-destructuring */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-mixed-operators */
const assert = require('assert');
const { doUntil, parallel } = require('async');
const werelogs = require('werelogs');
const { errors } = require('arsenal');
const Datastore = require('./Datastore');
const { generateKey, generateCounter, generateStateKey } = require('./schema');
const redisClient = require('../utils/redisClient');
const member = require('../utils/member');

const methods = {
    createBucket: { method: '_genericPushMetric', changesData: true },
    deleteBucket: { method: '_pushMetricDeleteBucket', changesData: true },
    listBucket: { method: '_genericPushMetric', changesData: false },
    getBucketAcl: { method: '_genericPushMetric', changesData: false },
    putBucketAcl: { method: '_genericPushMetric', changesData: true },
    putBucketCors: { method: '_genericPushMetric', changesData: true },
    getBucketCors: { method: '_genericPushMetric', changesData: false },
    deleteBucketCors: { method: '_genericPushMetric', changesData: true },
    putBucketWebsite: { method: '_genericPushMetric', changesData: true },
    getBucketWebsite: { method: '_genericPushMetric', changesData: false },
    getBucketLocation: { method: '_genericPushMetric', changesData: false },
    deleteBucketWebsite: { method: '_genericPushMetric', changesData: true },
    uploadPart: { method: '_genericPushMetricUploadPart', changesData: true },
    uploadPartCopy: {
        method: '_genericPushMetricUploadPart',
        changesData: true,
    },
    initiateMultipartUpload: {
        method: '_genericPushMetric',
        changesData: true,
    },
    completeMultipartUpload: {
        method: '_pushMetricCompleteMultipartUpload',
        changesData: true,
    },
    listMultipartUploads: {
        method: '_pushMetricListBucketMultipartUploads',
        changesData: false,
    },
    listMultipartUploadParts: {
        method: '_genericPushMetric',
        changesData: false,
    },
    abortMultipartUpload: {
        method: '_genericPushMetricDeleteObject',
        changesData: true,
    },
    deleteObject: {
        method: '_genericPushMetricDeleteObject',
        changesData: true,
    },
    multiObjectDelete: {
        method: '_genericPushMetricDeleteObject',
        changesData: true,
    },
    getObject: { method: '_pushMetricGetObject', changesData: false },
    getObjectAcl: { method: '_genericPushMetric', changesData: false },
    getObjectLegalHold: { method: '_genericPushMetric', changesData: false },
    getObjectRetention: { method: '_genericPushMetric', changesData: false },
    getObjectTagging: { method: '_genericPushMetric', changesData: false },
    putObject: { method: '_genericPushMetricPutObject', changesData: true },
    copyObject: { method: '_genericPushMetricPutObject', changesData: true },
    putData: { method: '_genericPushMetricPutObject', changesData: true },
    putObjectAcl: { method: '_genericPushMetric', changesData: true },
    putObjectLegalHold: { method: '_genericPushMetric', changesData: true },
    putObjectRetention: { method: '_genericPushMetric', changesData: true },
    putObjectTagging: { method: '_genericPushMetric', changesData: true },
    deleteObjectTagging: { method: '_genericPushMetric', changesData: true },
    headBucket: { method: '_genericPushMetric', changesData: false },
    headObject: { method: '_genericPushMetric', changesData: false },
    putBucketVersioning: { method: '_genericPushMetric', changesData: true },
    getBucketVersioning: { method: '_genericPushMetric', changesData: false },
    putDeleteMarkerObject: {
        method: '_pushMetricDeleteMarkerObject',
        changesData: true,
    },
    putBucketReplication: {
        method: '_genericPushMetric',
        changesData: true,
    },
    getBucketReplication: {
        method: '_genericPushMetric',
        changesData: false,
    },
    deleteBucketReplication: {
        method: '_genericPushMetric',
        changesData: true,
    },
    putBucketObjectLock: { method: '_genericPushMetric', changesData: true },
    getBucketObjectLock: { method: '_genericPushMetric', changesData: true },
};

const metricObj = {
    buckets: 'bucket',
    accounts: 'accountId',
    users: 'userId',
};

class UtapiClient {
    /**
     * Create a UtapiClient
     * @param {object} [config] - The configuration of UtapiClient
     * @param {werelogs.API} [config.logApi] - object providing a constructor
     *                                         function for the Logger object
     * @param {object} [config.redis] - Object defining the host and port of the
     * Redis datastore
     * @param {object} [config.localCache] - Object defining the host and port
     * of the local cache datastore
     * @param {array} [config.metrics] - Array defining the metric resource
     * types to push metrics for
     * @param {array} [config.component] - The component from which the metrics
     * are being pushed (e.g., 's3')
     * @param {boolean} [config.expireMetrics] - Boolean to expire metrics
     * when buckets are deleted.
     */
    constructor(config) {
        const api = (config || {}).logApi || werelogs;
        this.log = new api.Logger('UtapiClient');
        // By default, we push all resource types
        this.metrics = ['buckets', 'accounts', 'users', 'service'];
        this.service = 's3';
        this.disableOperationCounters = false;
        this.enabledOperationCounters = [];
        this.disableClient = true;

        if (config) {
            if (config.metrics) {
                const message = 'invalid property in UtapiClient configuration';
                assert(Array.isArray(config.metrics), `${message}: metrics `
                    + 'must be an array');
                assert(config.metrics.length !== 0, `${message}: metrics `
                    + 'array cannot be empty');
                this.metrics = config.metrics;
            }
            if (config.redis) {
                this.ds = new Datastore()
                    .setClient(redisClient(config.redis, this.log));
            }
            if (config.localCache) {
                this.localCache = new Datastore()
                    .setClient(redisClient(config.localCache, this.log));
            }
            if (config.component) {
                // The configuration uses the property `component`, while
                // internally this is known as a metric level `service`.
                this.service = config.component;
            }
            if (config.disableOperationCounters) {
                this.disableOperationCounters = config.disableOperationCounters;
            }
            if (config.enabledOperationCounters) {
                this.enabledOperationCounters = config.enabledOperationCounters;
            }
            this.disableClient = false;
            this.expireMetrics = config.expireMetrics;
            this.expireMetricsTTL = config.expireMetricsTTL || 0;
        }
    }

    /**
    * Normalizes timestamp precision to the nearest 15 minutes to
    * reduce the number of entries in a sorted set
    * @return {number} timestamp - normalized to the nearest 15 minutes
    */
    static getNormalizedTimestamp() {
        const d = new Date();
        const minutes = d.getMinutes();
        if (process.env.UTAPI_INTERVAL_TEST_MODE === 'true') {
            const seconds = d.getSeconds();
            return d.setSeconds((seconds - seconds % 15), 0, 0);
        }
        return d.setMinutes((minutes - minutes % 15), 0, 0);
    }

    /**
    * set datastore
    * @param {DataStore} ds - Datastore instance
    * @return {object} current instance
    */
    setDataStore(ds) {
        this.ds = ds;
        this.disableClient = false;
        return this;
    }

    _isCounterEnabled(action) {
        if (this.enabledOperationCounters.length > 0) {
            return this.enabledOperationCounters.some(counter => counter.toLowerCase() === action.toLowerCase());
        }
        return this.disableOperationCounters === false;
    }

    /*
    * Utility function to use when callback is not defined
    */
    _noop() {}

    /**
    * Attempt to push necessary data to local cache list for UtapiReplay, when
    * `pushMetric` call has failed
    * @param {object} params - params object with metric data
    * @param {string} operation - action of attempted pushMetric call
    * @param {string} timestamp - timestamp of the original pushMetric call
    * @param {object} log - Werelogs request logger
    * @param {callback} cb - callback to call
    * @return {undefined}
    */
    _pushLocalCache(params, operation, timestamp, log, cb) {
        // 'listMultipartUploads' has a different name in the metric response.
        const action = operation === 'listBucketMultipartUploads'
            ? 'listMultipartUploads' : operation;
        const logObject = {
            method: 'UtapiClient._pushLocalCache',
            action,
            params,
        };
        if (!this.localCache) {
            log.fatal('failed to push metrics', logObject);
            return cb(errors.InternalError);
        }
        const reqUid = log.getSerializedUids();
        const value = JSON.stringify({
            action, reqUid, params, timestamp,
        });
        return this.localCache.lpush('s3:utapireplay', value, err => {
            if (err) {
                log.error('error inserting data in local cache', logObject);
                return cb(err);
            }
            // Local cache entry succeeded.
            return cb(errors.InternalError);
        });
    }

    /**
    * Check the types of `params` object properties. This enforces object
    * properties for particular push metric calls.
    * @param {object} params - params object with metric data
    * @param {number} [params.byteLength] - (optional) size of an object deleted
    * @param {number} [params.newByteLength] - (optional) new object size
    * @param {number|null} [params.oldByteLength] - (optional) old object size
    * (for object overwrites). This value can be `null` for a new object,
    * or >= 0 for an existing object with content-length 0 or greater than 0.
    * @param {number} [params.numberOfObjects] - (optional) number of obects
    * @param {array} properties - (option) properties to assert types for
    * @return {undefined}
    */
    _checkProperties(params, properties = []) {
        properties.forEach(prop => {
            assert(params[prop] !== undefined, 'Metric object must include '
                + `${prop} property`);
            if (prop === 'oldByteLength') {
                assert(typeof params[prop] === 'number'
                    || params[prop] === null, 'oldByteLength  property must be '
                    + 'an integer or `null`');
            } else {
                assert(typeof params[prop] === 'number', `${prop} property `
                    + 'must be an integer');
            }
        });
    }


    /**
     * Check that the expected properties for metric levels (as defined in
     * the config) are in the object passed to the client. Otherwise, ensure
     * that there is at least one metric level to push metrics for.
     * @param {object} params - params object with metric data
     * @param {string} [params.bucket] - (optional) bucket name
     * @param {string} [params.accountId] - (optional) account ID
     * @return {undefined}
     */
    _checkMetricTypes(params) {
        // Object of metric types and their associated property names
        this.metrics.forEach(level => {
            const propName = metricObj[level];
            assert(typeof params[propName] === 'string'
                || params[propName] === undefined,
            `${propName} must be a string`);
        });
    }

    /**
     * Utility function to log the metric being pushed.
     * @param {object} params - params object with metric data
     * @param {string} method - the name of the method being logged
     * @param {number} timestamp - normalized timestamp of current time
     * @param {object} log - Werelogs request logger
     * @return {undefined}
     */
    _logMetric(params, method, timestamp, log) {
        const { bucket, accountId, userId } = params;
        const logObject = {
            method: `UtapiClient.${method}`,
            bucketName: bucket,
            accountId,
            userId,
            service: this.service,
            timestamp,
        };
        log.trace('pushing metric', logObject);
    }

    /**
     * Creates an array of parameter objects for each metric type. The number
     * of objects in the array will be the number of metric types included in
     * the `params` object.
     * @param {object} params - params object with all metric data passed to
     * UtapiClient
     * @return {object []} arr - array of parameter objects for push metric call
     */
    _getParamsArr(params) {
        this._checkMetricTypes(params);
        const props = [];
        const {
            byteLength, newByteLength, oldByteLength, numberOfObjects,
        } = params;
        // We add a `service` property to any non-service level to be able to
        // build the appropriate schema key.
        this.metrics.forEach(level => {
            const prop = metricObj[level];
            // There will be no `service` property of the params.
            if (params[prop] || level === 'service') {
                const obj = {
                    level,
                    service: this.service,
                    byteLength,
                    newByteLength,
                    oldByteLength,
                    numberOfObjects,
                };
                if (level !== 'service') {
                    obj[prop] = params[prop];
                }
                props.push(obj);
            }
        });
        return props;
    }

    /**
    * Publish an event in the bucket's dedicated channel to notify subscribers
    * for performed actions with side effects
    * @param {string} metric - metric to be published
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {array} [params.keys] - (optional) keys of affected objects
    * @param {object} log - logger
    * @param {callback} [callback] - (optional) callback to call
    * @return {undefined}
    */
    _publishEvent(metric, params, log, callback) {
        const { bucket, keys } = params;
        const message = (keys || []).reduce((a, b) => `${a}:${b}`, metric);
        return this.ds.publish(`s3:event:${bucket}`, message, err => {
            if (err) {
                log.error('Failed to publish event, ignored', {
                    bucket,
                    message,
                    error: err,
                });
            }
            if (typeof callback === 'function') {
                return callback();
            }
            return undefined;
        });
    }

    /**
    * Callback for methods used to push metrics to Redis
    * @callback pushMetric callback
    * @param {object} err - ArsenalError instance
    */

    /**
    * Generic method exposed by the client to push a metric with some values.
    * `params` can be expanded to provide metrics for metric granularities
    * (e.g. 'bucket', 'account').
    * @param {string} metric - metric to be published
    * @param {string} reqUid - Request Unique Identifier
    * @param {object} params - params object with metric data
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account id
    * @param {number} [params.byteLength] - (optional) size of an object deleted
    * @param {number} [params.newByteLength] - (optional) new object size
    * @param {number|null} [params.oldByteLength] - (optional) old object size
    * (for object overwrites). This value can be `null` for a new object,
    * or >= 0 for an existing object with content-length 0 or greater than 0.
    * @param {number} [params.numberOfObjects] - (optional) number of obects
    * added/deleted
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetric(metric, reqUid, params, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        if (methods[metric] && this[methods[metric].method]) {
            return this[methods[metric].method](
                params, timestamp, metric, log, err => {
                    if (err) {
                        return callback(err);
                    }
                    if (methods[metric].changesData) {
                        return this._publishEvent(metric, params,
                            log, callback);
                    }
                    return callback();
                },
            );
        }
        log.debug(`UtapiClient::pushMetric: ${metric} unsupported`);
        return callback();
    }

    /**
    * Updates counter for the given action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _genericPushMetric(params, timestamp, action, log, callback) {
        if (!this._isCounterEnabled(action)) {
            return process.nextTick(callback);
        }
        this._checkProperties(params);
        this._logMetric(params, '_genericPushMetric', timestamp, log);
        const cmds = this._getParamsArr(params)
            .map(p => ['incr', generateKey(p, action, timestamp)]);
        return this.ds.batch(cmds, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient._genericPushMetric',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log,
                    callback);
            }
            return callback();
        });
    }

    _pushMetricDeleteBucket(params, timestamp, action, log, callback) {
        this._genericPushMetric(params, timestamp, action, log, err => {
            if (err) {
                return callback(err);
            }
            if (!this.expireMetrics) {
                return callback();
            }
            const { bucket } = params;
            const statelessKeysGlob = `s3:buckets:*:${bucket}:*`;
            const statefulKeysGlob = `s3:buckets:${bucket}:*`;
            return parallel([
                done => this._scanKeys(statelessKeysGlob, log, done),
                done => this._scanKeys(statefulKeysGlob, log, done),
            ], (err, keys) => {
                if (err) {
                    return callback(err);
                }
                return this._expireMetrics([].concat(...keys), log, callback);
            });
        });
    }

    _scanKeys(pattern, log, callback) {
        let cursor = '0';
        const keys = [];
        doUntil(
            done => this.ds.scan(cursor, pattern, (err, res) => {
                if (err) {
                    return done(err);
                }
                cursor = res[0];
                // builds an array like [['expire', <key>, <ttl>], ...]
                // keys.push(...res[1].map(val => ['expire', val]));
                keys.push(...res[1]);
                return done();
            }),
            // if cursor is 0, it reached end of scan
            () => cursor === '0',
            err => callback(err, keys),
        );
    }

    _expireMetrics(keys, log, callback) {
        // expire metrics here
        const expireCmds = keys.map(k => ['expire', k, this.expireMetricsTTL]);
        return this.ds.multi(expireCmds, (err, result) => {
            if (err) {
                const logParam = Array.isArray(err) ? { errorList: err }
                    : { error: err };
                log.error('error expiring metrics', logParam);
                return callback(err);
            }
            // each delete command gets a score 1 if  it's a success,
            // should match the total commands sent for deletion
            const allKeysDeleted = keys.length === result.reduce((a, v) => a + v, 0);
            if (!allKeysDeleted) {
                log.debug('error expiring keys', { delResult: result });
                return callback(
                    errors.InternalError.customizeDescription(
                        'error expiring some keys',
                    ),
                );
            }
            return callback();
        });
    }

    /**
    * Updates counter for the putDeleteMarkerObject action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {string} [params.userId] - (optional) user ID
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {function} cb - callback to call
    * @return {undefined}
    */
    _pushMetricDeleteMarkerObject(params, timestamp, action, log, cb) {
        this._checkProperties(params);
        this._logMetric(params, '_pushMetricDeleteMarkerObject', timestamp,
            log);
        const cmds = [];
        const paramsArr = this._getParamsArr(params);
        paramsArr.forEach(p => {
            cmds.push(['incr', generateCounter(p, 'numberOfObjectsCounter')]);
            if (this._isCounterEnabled('deleteObject')) {
                cmds.push(['incr', generateKey(p, 'deleteObject', timestamp)]);
            }
        });
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient._pushMetricDeleteMarkerObject',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log, cb);
            }
            const cmds2 = [];
            // We track the number of commands needed for each `paramsArr`
            // property to eventually locate each group in the results from
            // Redis.
            const commandsGroupSize = (cmds.length / paramsArr.length);
            const noErr = paramsArr.every((p, i) => {
                // We want the first element of every group of commands returned
                // from Redis. This contains the value of the
                // numberOfObjectsCounter after it has been incremented.
                const index = i * commandsGroupSize;
                const actionErr = results[index][0];
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._pushMetricDeleteMarkerObject',
                        metric: 'number of objects',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log, cb);
                    return false;
                }
                let actionCounter = parseInt(results[index][1], 10);
                // If < 0 or NaN, record numberOfObjects as though bucket were
                // empty.
                actionCounter = Number.isNaN(actionCounter)
                    || actionCounter < 0 ? 1 : actionCounter;
                const key = generateStateKey(p, 'numberOfObjects');
                cmds2.push(
                    ['zremrangebyscore', key, timestamp, timestamp],
                    ['zadd', key, timestamp, member.serialize(actionCounter)],
                );
                return true;
            });
            if (noErr) {
                return this.ds.batch(cmds2, cb);
            }
            return undefined;
        });
    }

    /**
    * Updates counter for UploadPart or UploadPartCopy action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _genericPushMetricUploadPart(params, timestamp, action, log, callback) {
        this._checkProperties(params, ['newByteLength', 'oldByteLength']);
        this._logMetric(params, '_genericPushMetricUploadPart', timestamp, log);
        const cmds = [];
        const { newByteLength, oldByteLength } = params;
        const oldObjSize = oldByteLength === null ? 0 : oldByteLength;
        const storageUtilizedDelta = newByteLength - oldObjSize;
        const paramsArr = this._getParamsArr(params);
        paramsArr.forEach(p => {
            cmds.push(
                ['incrby', generateCounter(p, 'storageUtilizedCounter'),
                    storageUtilizedDelta],
                ['incrby', generateKey(p, 'incomingBytes', timestamp),
                    newByteLength],
            );
            if (this._isCounterEnabled(action)) {
                cmds.push(['incr', generateKey(p, action, timestamp)]);
            }
        });
        // update counters
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient._genericPushMetricUploadPart',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log,
                    callback);
            }
            // storage utilized counters
            let index;
            let actionErr;
            let actionCounter;
            const cmdsLen = cmds.length;
            const paramsArrLen = paramsArr.length;
            const cmds2 = [];
            const noErr = paramsArr.every((p, i) => {
                // index corresponds to the result from the previous set of
                // commands. we are trying to extract the storage utlized
                // counters per metric level here.
                index = i * (cmdsLen / paramsArrLen);
                actionErr = results[index][0];
                actionCounter = parseInt(results[index][1], 10);
                // If < 0, record storageUtilized as though bucket were empty.
                actionCounter = actionCounter < 0 ? storageUtilizedDelta
                    : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricUploadPart',
                        metric: 'storage utilized',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log,
                        callback);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore', generateStateKey(p, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd', generateStateKey(p, 'storageUtilized'),
                        timestamp, member.serialize(actionCounter)],
                );
                return true;
            });
            if (noErr) {
                return this.ds.batch(cmds2, callback);
            }
            return undefined;
        });
    }

    _multipartUploadOverwrite(params, timestamp, action, log, cb) {
        const counterCommands = [];
        const levels = this._getParamsArr(params);

        levels.forEach(level => {
            const key = generateCounter(level, 'storageUtilizedCounter');
            counterCommands.push(['decrby', key, params.oldByteLength]);

            if (this._isCounterEnabled(action)) {
                const key = generateKey(level, action, timestamp);
                counterCommands.push(['incr', key]);
            }
        });

        return this.ds.batch(counterCommands, (err, res) => {
            if (err) {
                log.error('error decrementing counter for push metric', {
                    method: 'UtapiClient._multipartUploadOverwrite',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log, cb);
            }

            const commandErr = res.find(i => i[0]);
            if (commandErr) {
                log.error('error decrementing counter for push metric', {
                    method: 'UtapiClient._multipartUploadOverwrite',
                    error: commandErr,
                });
                return this._pushLocalCache(params, action, timestamp, log, cb);
            }

            const sortedSetCommands = [];

            levels.forEach((level, i) => {
                const key = generateStateKey(level, 'storageUtilized');
                // We want the result of the storage utilized counter update
                // that is the first of every group of levels.
                const groupSize = counterCommands.length / levels.length;
                const value = res[i * groupSize][1];
                const storageUtilized = Number.parseInt(value, 10);
                sortedSetCommands.push(
                    ['zremrangebyscore', key, timestamp, timestamp],
                    ['zadd', key, timestamp, member.serialize(storageUtilized)],
                );
            });

            return this.ds.batch(sortedSetCommands, cb);
        });
    }

    /**
    * Updates counter for CompleteMultipartUpload action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricCompleteMultipartUpload(params, timestamp, action, log,
        callback) {
        this._checkProperties(params);
        this._logMetric(params, '_pushMetricCompleteMultipartUpload', timestamp,
            log);

        // Is the MPU completion overwriting an object?
        if (params.oldByteLength !== null) {
            return this._multipartUploadOverwrite(
                params, timestamp, action, log, callback,
            );
        }

        const paramsArr = this._getParamsArr(params);
        const cmds = [];
        paramsArr.forEach(p => {
            cmds.push(['incr', generateCounter(p, 'numberOfObjectsCounter')]);
            if (this._isCounterEnabled(action)) {
                cmds.push(['incr', generateKey(p, action, timestamp)]);
            }
        });
        // We track the number of commands needed for each `paramsArr` object to
        // eventually locate each group in the results from Redis.
        const commandsGroupSize = (cmds.length / paramsArr.length);
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient._pushMetricCompleteMultipartUpload',
                    metric: 'number of objects',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log,
                    callback);
            }
            // number of objects counters
            let actionErr;
            let actionCounter;
            let key;
            const cmds2 = [];
            const noErr = paramsArr.every((p, i) => {
                // We want the first element of every group of two commands
                // returned from Redis.
                const index = i * commandsGroupSize;
                actionErr = results[index][0];
                actionCounter = parseInt(results[index][1], 10);
                // If < 0, record numberOfObjects as though bucket were empty.
                actionCounter = actionCounter < 0 ? 1 : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._pushMetricCompleteMultipart'
                            + 'Upload',
                        metric: 'number of objects',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log,
                        callback);
                    return false;
                }
                key = generateStateKey(p, 'numberOfObjects');
                cmds2.push(['zremrangebyscore', key, timestamp, timestamp],
                    ['zadd', key, timestamp, member.serialize(actionCounter)]);
                return true;
            });
            if (noErr) {
                return this.ds.batch(cmds2, callback);
            }
            return undefined;
        });
    }

    /**
    * Updates counter for listBucketMultipartUploads action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricListBucketMultipartUploads(params, timestamp, action, log,
        callback) {
        return this._genericPushMetric(params, timestamp,
            'listBucketMultipartUploads', log, callback);
    }

    /**
    * Updates counter for DeleteObject, MultiObjectDelete, or
    * AbortMultipartUpload action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} params.byteLength - size of the object deleted
    * @param {number} params.numberOfObjects - number of objects deleted
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _genericPushMetricDeleteObject(params, timestamp, action, log, callback) {
        const expectedProps = action === 'abortMultipartUpload'
            ? ['byteLength'] : ['byteLength', 'numberOfObjects'];
        this._checkProperties(params, expectedProps);
        const { byteLength, numberOfObjects } = params;
        this._logMetric(params, '_genericPushMetricDeleteObject', timestamp,
            log);
        const paramsArr = this._getParamsArr(params);
        const cmds = [];
        // We push Redis commands to be executed in batch. The type of commands
        // to push depends on the action.
        paramsArr.forEach(p => {
            cmds.push(
                ['decrby', generateCounter(p, 'storageUtilizedCounter'),
                    byteLength],
            );
            if (this._isCounterEnabled(action)) {
                cmds.push(['incr', generateKey(p, action, timestamp)]);
            }
            // The 'abortMultipartUpload' action affects only storage utilized,
            // so number of objects remains unchanged.
            if (action !== 'abortMultipartUpload') {
                cmds.push(['decrby', generateCounter(p,
                    'numberOfObjectsCounter'), numberOfObjects]);
            }
        });
        // We track the number of commands needed for each `paramsArr` object to
        // eventually locate each group in the results from Redis.
        const commandsGroupSize = (cmds.length / paramsArr.length);
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient._genericPushMetricDeleteObject',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log,
                    callback);
            }
            // `results` is an array of arrays. `results` elements are the
            // return values of each command in `cmds` and contains two
            // elements: the error and the value stored at the key.
            const cmds2 = [];
            let actionErr;
            let actionCounter;
            // We now need to record Sorted Set keys. To do so, we push commands
            // to another array, `cmds2`, for a second batch execution.
            // Also, we check for any error from the previous batch operation.
            const noErr = paramsArr.every((p, i) => {
                // The beginning location of each group of command results.
                const currentResultsGroup = i * commandsGroupSize;
                // The storage utilized result is the first element of each
                // group of metrics.
                actionErr = results[currentResultsGroup][0];
                actionCounter = parseInt(results[currentResultsGroup][1], 10);
                // If < 0, record storageUtilized as though bucket were empty.
                actionCounter = actionCounter < 0 ? 0 : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricDeleteObject',
                        metric: 'storage utilized',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log,
                        callback);
                    return false;
                }
                // Sorted Set keys are updated with the value stored at their
                // respective counter key (i.e., the value of `actionCounter`).
                cmds2.push(
                    ['zremrangebyscore', generateStateKey(p, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd',
                        generateStateKey(p, 'storageUtilized'), timestamp,
                        member.serialize(actionCounter)],
                );
                // The 'abortMultipartUpload' action does not affect number of
                // objects, so we return here.
                if (action === 'abortMultipartUpload') {
                    return true;
                }
                // The number of objects counter result is the last element of
                // each group of commands.
                const numberOfObjectsResult = currentResultsGroup + (commandsGroupSize - 1);
                actionErr = results[numberOfObjectsResult][0];
                actionCounter = parseInt(results[numberOfObjectsResult][1], 10);
                // If < 0, record numberOfObjects as though bucket were empty.
                actionCounter = actionCounter < 0 ? 0 : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricDeleteObject',
                        metric: 'storage utilized',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log,
                        callback);
                    return false;
                }
                // Sorted Set keys are updated with the value stored at their
                // respective counter key (i.e., the value of `actionCounter`).
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'numberOfObjects'), timestamp,
                        timestamp],
                    ['zadd', generateStateKey(p, 'numberOfObjects'), timestamp,
                        member.serialize(actionCounter)],
                );
                return true;
            });
            if (noErr) {
                return this.ds.batch(cmds2, callback);
            }
            return undefined;
        });
    }

    /**
    * Updates counter for GetObject action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricGetObject(params, timestamp, action, log, callback) {
        this._checkProperties(params, ['newByteLength']);
        const { newByteLength } = params;
        this._logMetric(params, '_pushMetricGetObject', timestamp, log);
        const paramsArr = this._getParamsArr(params);
        const cmds = [];
        paramsArr.forEach(p => {
            cmds.push(
                ['incrby', generateKey(p, 'outgoingBytes', timestamp),
                    newByteLength],
            );
            if (this._isCounterEnabled(action)) {
                cmds.push(['incr', generateKey(p, action, timestamp)]);
            }
        });
        // update counters
        return this.ds.batch(cmds, err => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient._pushMetricGetObject',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log,
                    callback);
            }
            return callback();
        });
    }


    /**
    * Generic method to push metrics for putObject/copyObject operations
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} params.oldByteLength - previous size of object
    * in bytes if this action overwrote an existing object
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action metric to update
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _genericPushMetricPutObject(params, timestamp, action, log, callback) {
        this._checkProperties(params, ['newByteLength', 'oldByteLength']);
        this._logMetric(params, '_genericPushMetricPutObject', timestamp, log);
        const { newByteLength, oldByteLength } = params;
        const oldObjSize = oldByteLength === null ? 0 : oldByteLength;
        const storageUtilizedDelta = newByteLength - oldObjSize;
        const cmds = [];
        // if previous object size is null then it's a new object in a bucket
        // or else it's an old object being overwritten
        const redisCmd = oldByteLength === null ? 'incr' : 'get';
        const paramsArr = this._getParamsArr(params);
        paramsArr.forEach(p => {
            cmds.push(
                ['incrby', generateCounter(p, 'storageUtilizedCounter'),
                    storageUtilizedDelta],
                [redisCmd, generateCounter(p, 'numberOfObjectsCounter')],
            );
            if (action !== 'putData' && this._isCounterEnabled(action)) {
                cmds.push(['incr', generateKey(p, action, timestamp)]);
            }
            if (action === 'putObject' || action === 'putData') {
                cmds.push(
                    ['incrby', generateKey(p, 'incomingBytes', timestamp),
                        newByteLength],
                );
            }
        });

        // update counters
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient._genericPushMetricPutObject',
                    error: err,
                });
                return this._pushLocalCache(params, action, timestamp, log,
                    callback);
            }
            const cmds2 = [];
            let actionErr;
            let actionCounter;
            let storageIndex;
            let objectsIndex;
            const cmdsLen = cmds.length;
            const paramsArrLen = paramsArr.length;
            const noErr = paramsArr.every((p, i) => {
                // storage utilized counter
                storageIndex = (i * (cmdsLen / paramsArrLen));
                actionErr = results[storageIndex][0];
                actionCounter = parseInt(results[storageIndex][1], 10);
                // If < 0, record storageUtilized as though bucket were empty.
                actionCounter = actionCounter < 0 ? storageUtilizedDelta
                    : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricPutObject',
                        metric: 'storage utilized',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log,
                        callback);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd', generateStateKey(p, 'storageUtilized'),
                        timestamp, member.serialize(actionCounter)],
                );

                // number of objects counter
                objectsIndex = (i * (cmdsLen / paramsArrLen)) + 1;
                actionErr = results[objectsIndex][0];
                actionCounter = parseInt(results[objectsIndex][1], 10);
                // If the key does not exist, actionCounter will be null.
                // Hence we check that action counter is a number and is > 0. If
                // true, we record numberOfObjects as though bucket were empty.
                actionCounter = Number.isNaN(actionCounter)
                    || actionCounter < 0 ? 1 : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricPutObject',
                        metric: 'number of objects',
                        error: actionErr,
                    });
                    this._pushLocalCache(params, action, timestamp, log,
                        callback);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'numberOfObjects'),
                        timestamp, timestamp],
                    ['zadd', generateStateKey(p, 'numberOfObjects'),
                        timestamp, member.serialize(actionCounter)],
                );
                return true;
            });
            if (noErr) {
                return this.ds.batch(cmds2, callback);
            }
            return undefined;
        });
    }

    /**
     * Get storage used by bucket/account/user/service
     * @param {object} params - params for the metrics
     * @param {string} [params.bucket] - (optional) bucket name
     * @param {string} [params.accountId] - (optional) account canonical ID
     * @param {string} [params.userId] - (optional) account ID
     * @param {string} [params.level] - (required) level of granularity
     * @param {string} [params.service] - (required) service name (s3 for ex.)
     * @param {object} log - Werelogs request logger
     * @param {callback} callback - callback to call
     * @return {undefined}
     */
    getStorageUtilized(params, log, callback) {
        const key = generateCounter(params, 'storageUtilizedCounter');
        this.ds.get(key, (err, res) => {
            if (err) {
                log.error('error getting storage utilized', {
                    method: 'UtapiClient: getStorageUtilized',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback(null, res);
        });
    }
}

module.exports = UtapiClient;
