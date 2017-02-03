import assert from 'assert';
import { Logger } from 'werelogs';
import Datastore from './Datastore';
import { generateKey, generateCounter, getCounters, generateStateKey }
    from './schema';
import { errors } from 'arsenal';
import redisClient from '../utils/redisClient';

const methods = {
    createBucket: '_pushMetricCreateBucket',
    deleteBucket: '_genericPushMetric',
    listBucket: '_genericPushMetric',
    getBucketAcl: '_genericPushMetric',
    putBucketAcl: '_genericPushMetric',
    putBucketCors: '_genericPushMetric',
    getBucketCors: '_genericPushMetric',
    deleteBucketCors: '_genericPushMetric',
    putBucketWebsite: '_genericPushMetric',
    getBucketWebsite: '_genericPushMetric',
    deleteBucketWebsite: '_genericPushMetric',
    uploadPart: '_pushMetricUploadPart',
    initiateMultipartUpload: '_genericPushMetric',
    completeMultipartUpload: '_pushMetricCompleteMultipartUpload',
    listMultipartUploads: '_pushMetricListBucketMultipartUploads',
    listMultipartUploadParts: '_genericPushMetric',
    abortMultipartUpload: '_genericPushMetric',
    deleteObject: '_genericPushMetricDeleteObject',
    multiObjectDelete: '_genericPushMetricDeleteObject',
    getObject: '_pushMetricGetObject',
    getObjectAcl: '_genericPushMetric',
    putObject: '_genericPushMetricPutObject',
    copyObject: '_genericPushMetricPutObject',
    putObjectAcl: '_genericPushMetric',
    headBucket: '_genericPushMetric',
    headObject: '_genericPushMetric',
};

const metricObj = {
    buckets: 'bucket',
    accounts: 'accountId',
};

export default class UtapiClient {
    constructor(config) {
        this.disableClient = true;
        this.log = null;
        this.ds = null;
        // setup logger
        if (config && config.log) {
            this.log = new Logger('UtapiClient', { level: config.log.level,
                    dump: config.log.dumpLevel });
        } else {
            this.log = new Logger('UtapiClient', { level: 'info',
                dump: 'error' });
        }
        // setup datastore
        if (config && config.redis) {
            this.ds = new Datastore()
                .setClient(redisClient(config.redis, this.log));
            this.disableClient = false;
        }
        // Use metric levels included in the config, or use all metrics.
        if (config && config.metrics) {
            assert(Array.isArray(config.metrics), '`metrics` property of ' +
            'Utapi configuration must be an array');
            assert(config.metrics.length !== 0, '`metrics` property of Utapi ' +
            'configuration must contain at least one metric');
            this.metrics = config.metrics;
        } else {
            this.metrics = ['buckets', 'accounts'];
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

    /*
    * Utility function to use when callback is not defined
    */
    _noop() {}

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
            assert(params[prop] !== undefined, 'Metric object must include ' +
                `${prop} property`);
            if (prop === 'oldByteLength') {
                assert(typeof params[prop] === 'number' ||
                    params[prop] === null, 'oldByteLength  property must be ' +
                    'an integer or `null`');
            } else {
                assert(typeof params[prop] === 'number', `${prop} property ` +
                    'must be an integer');
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
        assert(this.metrics.some(level =>
            metricObj[level] in params), 'Must include a metric level');
        // Object of metric types and their associated property names
        this.metrics.forEach(level => {
            const propName = metricObj[level];
            assert(typeof params[propName] === 'string' ||
                params[propName] === undefined,
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
        const { bucket, accountId } = params;
        const logObject = bucket ? { bucket } : { accountId };
        logObject.method = `UtapiClient.${method}`;
        logObject.timestamp = timestamp;
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
        const { byteLength, newByteLength, oldByteLength, numberOfObjects } =
            params;
        const metricData = {
            byteLength,
            newByteLength,
            oldByteLength,
            numberOfObjects,
        };
        // Only push metric levels defined in the config, otherwise push any
        // levels that are passed in the object
        if (params.bucket && this.metrics.indexOf('buckets') >= 0) {
            props.push(Object.assign({
                bucket: params.bucket,
                level: 'buckets',
            }, metricData));
        }
        if (params.accountId && this.metrics.indexOf('accounts') >= 0) {
            props.push(Object.assign({
                accountId: params.accountId,
                level: 'accounts',
            }, metricData));
        }
        return props;
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
        assert(methods[metric], `${metric} metric is not handled by Utapi`);
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        return this[methods[metric]](params, timestamp, metric, log, callback);
    }

    /**
    * Updates counter for CreateBucket action
    * @param {object} params - params for the metrics
    * @param {string} [params.bucket] - (optional) bucket name
    * @param {string} [params.accountId] - (optional) account ID
    * @param {number} timestamp - normalized timestamp of current time
    * @param {string} action - action to push metric for
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricCreateBucket(params, timestamp, action, log, callback) {
        this._checkProperties(params);
        this._logMetric(params, '_pushMetricCreateBucket', timestamp, log);
        // set storage utilized and number of objects counters to 0,
        // indicating the start of the bucket timeline
        let cmds = [];
        this._getParamsArr(params).forEach(p => {
            cmds = cmds.concat(getCounters(p).map(item => ['set', item, 0]));
            cmds.push(
                // remove old timestamp entries
                ['zremrangebyscore',
                    generateStateKey(p, 'storageUtilized'), timestamp,
                        timestamp],
                ['zremrangebyscore', generateStateKey(p, 'numberOfObjects'),
                    timestamp, timestamp],
                // add new timestamp entries
                ['zadd', generateStateKey(p, 'storageUtilized'), timestamp, 0],
                ['zadd', generateStateKey(p, 'numberOfObjects'), timestamp, 0]
            );
            // CreateBucket action occurs only once in a bucket's lifetime, so
            // for bucket-level metrics, counter is always 1.
            if ('bucket' in p) {
                cmds.push(['set', generateKey(p, action, timestamp), 1]);
            } else {
                cmds.push(['incr', generateKey(p, action, timestamp)]);
            }
        });
        return this.ds.batch(cmds, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets._pushMetricCreateBucket',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
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
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for UploadPart action
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
    _pushMetricUploadPart(params, timestamp, action, log, callback) {
        this._checkProperties(params, ['newByteLength']);
        const { newByteLength } = params;
        this._logMetric(params, '_pushMetricUploadPart', timestamp, log);
        const cmds = [];
        const paramsArr = this._getParamsArr(params);
        paramsArr.forEach(p => {
            cmds.push(
                ['incrby', generateCounter(p, 'storageUtilizedCounter'),
                    newByteLength],
                ['incrby', generateKey(p, 'incomingBytes', timestamp),
                    newByteLength],
                ['incr', generateKey(p, action, timestamp)]
            );
        });
        // update counters
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient._pushMetricUploadPart',
                    error: err,
                });
                return callback(errors.InternalError);
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
                actionCounter = results[index][1];
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._pushMetricUploadPart',
                        metric: 'storage utilized',
                        error: actionErr,
                    });
                    callback(errors.InternalError);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore', generateStateKey(p, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd', generateStateKey(p, 'storageUtilized'),
                        timestamp, actionCounter]
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
        const paramsArr = this._getParamsArr(params);
        const cmds = [];
        paramsArr.forEach(p => {
            cmds.push(
                ['incr', generateCounter(p, 'numberOfObjectsCounter')],
                ['incr', generateKey(p, action, timestamp)]
            );
        });
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient._pushMetricCompleteMultipartUpload',
                    metric: 'number of objects',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            // number of objects counters
            let index;
            let actionErr;
            let actionCounter;
            let key;
            const paramsArrLen = paramsArr.length;
            const cmds2 = [];
            const noErr = paramsArr.every((p, i) => {
                index = i * paramsArrLen;
                actionErr = results[index][0];
                actionCounter = results[index][1];
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._pushMetricCompleteMultipart' +
                            'Upload',
                        metric: 'number of objects',
                        error: actionErr,
                    });
                    callback(errors.InternalError);
                    return false;
                }
                key = generateStateKey(p, 'numberOfObjects');
                cmds2.push(['zremrangebyscore', key, timestamp, timestamp],
                ['zadd', key, timestamp, actionCounter]);
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
    * Updates counter for DeleteObject or MultiObjectDelete action
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
        this._checkProperties(params, ['byteLength', 'numberOfObjects']);
        const { byteLength, numberOfObjects } = params;
        this._logMetric(params, '_genericPushMetricDeleteObject', timestamp,
            log);
        const paramsArr = this._getParamsArr(params);
        const cmds = [];
        paramsArr.forEach(p => {
            cmds.push(
                ['decrby', generateCounter(p, 'storageUtilizedCounter'),
                    byteLength],
                ['decrby', generateCounter(p, 'numberOfObjectsCounter'),
                    numberOfObjects],
                ['incr', generateKey(p, action, timestamp)]
            );
        });
        const cmdsLen = cmds.length;
        const paramsArrLen = paramsArr.length;
        return this.ds.batch(cmds, (err, results) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient._genericPushMetricDeleteObject',
                    error: err,
                });
                return callback(errors.InternalError);
            }

            const cmds2 = [];
            let actionErr;
            let actionCounter;
            let storageIndex;
            let objectsIndex;
            const noErr = paramsArr.every((p, i) => {
                // storage utilized counter
                storageIndex = i * (cmdsLen / paramsArrLen);
                actionErr = results[storageIndex][0];
                actionCounter = parseInt(results[storageIndex][1],
                    10);
                actionCounter = actionCounter < 0 ? 0 : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric',
                        {
                            method: 'UtapiClient._genericPushMetricDelete' +
                            'Object',
                            metric: 'storage utilized',
                            error: actionErr,
                        }
                    );
                    callback(errors.InternalError);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd',
                        generateStateKey(p, 'storageUtilized'),
                        timestamp, actionCounter]);

                // num of objects counter
                objectsIndex = i * (cmdsLen / paramsArrLen) + 1;
                actionErr = results[objectsIndex][0];
                actionCounter = parseInt(results[objectsIndex][1], 10);
                actionCounter = actionCounter < 0 ? 0 : actionCounter;
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricDeleteObject',
                        metric: 'num of objects',
                        error: actionErr,
                    });
                    callback(errors.InternalError);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'numberOfObjects'), timestamp,
                        timestamp],
                    ['zadd', generateStateKey(p, 'numberOfObjects'),
                        timestamp, actionCounter]);
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
                ['incr', generateKey(p, action, timestamp)]
            );
        });
        // update counters
        return this.ds.batch(cmds, err => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient._pushMetricGetObject',
                    error: err,
                });
                return callback(errors.InternalError);
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
                ['incr', generateKey(p, action, timestamp)]
            );
            if (action === 'putObject') {
                cmds.push(
                    ['incrby', generateKey(p, 'incomingBytes', timestamp),
                        newByteLength]
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
                return callback(errors.InternalError);
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
                actionCounter = results[storageIndex][1];
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricPutObject',
                        metric: 'storage utilized',
                        error: actionErr,
                    });
                    callback(errors.InternalError);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd', generateStateKey(p, 'storageUtilized'),
                        timestamp, actionCounter]);

                // number of objects counter
                objectsIndex = (i * (cmdsLen / paramsArrLen)) + 1;
                actionErr = results[objectsIndex][0];
                actionCounter = results[objectsIndex][1];
                if (actionErr) {
                    log.error('error incrementing counter for push metric', {
                        method: 'UtapiClient._genericPushMetricPutObject',
                        metric: 'number of objects',
                        error: actionErr,
                    });
                    callback(errors.InternalError);
                    return false;
                }
                cmds2.push(
                    ['zremrangebyscore',
                        generateStateKey(p, 'numberOfObjects'),
                        timestamp, timestamp],
                    ['zadd', generateStateKey(p, 'numberOfObjects'),
                        timestamp, actionCounter]);
                return true;
            });
            if (noErr) {
                return this.ds.batch(cmds2, callback);
            }
            return undefined;
        });
    }
}
