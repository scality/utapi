import assert from 'assert';
import { Logger } from 'werelogs';
import Datastore from './Datastore';
import { genBucketKey, genBucketCounter, getBucketCounters, genBucketStateKey }
    from './schema';
import { errors } from 'arsenal';
import redisClient from '../utils/redisClient';

const methods = {
    createBucket: '_pushMetricCreateBucket',
    deleteBucket: '_pushMetricDeleteBucket',
    listBucket: '_pushMetricListBucket',
    getBucketAcl: '_pushMetricGetBucketAcl',
    putBucketAcl: '_pushMetricPutBucketAcl',
    putBucketWebsite: '_pushMetricPutBucketWebsite',
    getBucketWebsite: '_pushMetricGetBucketWebsite',
    deleteBucketWebsite: '_pushMetricDeleteBucketWebsite',
    uploadPart: '_pushMetricUploadPart',
    initiateMultipartUpload: '_pushMetricInitiateMultipartUpload',
    completeMultipartUpload: '_pushMetricCompleteMultipartUpload',
    listMultipartUploads: '_pushMetricListBucketMultipartUploads',
    listMultipartUploadParts: '_pushMetricListMultipartUploadParts',
    abortMultipartUpload: '_pushMetricAbortMultipartUpload',
    deleteObject: '_pushMetricDeleteObject',
    multiObjectDelete: '_pushMetricMultiObjectDelete',
    getObject: '_pushMetricGetObject',
    getObjectAcl: '_pushMetricGetObjectAcl',
    putObject: '_pushMetricPutObject',
    copyObject: '_pushMetricCopyObject',
    putObjectAcl: '_pushMetricPutObjectAcl',
    headBucket: '_pushMetricHeadBucket',
    headObject: '_pushMetricHeadObject',
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
    * Check the types of optional `params` object properties. This enforces
    * object properties for particular push metric calls and property types.
    * @param {object} params - params object with metric data
    * @param {string} params.bucket - bucket name
    * @param {number} params.byteLength - (optional) size of an object deleted
    * @param {number} params.newByteLength - (optional) new object size
    * @param {number|null} params.oldByteLength - (optional) old object size
    * (for object overwrites). This value can be `null` for a new object,
    * or >= 0 for an existing object with content-length 0 or greater than 0.
    * @param {number} params.numberOfObjects - (optional) number of obects
    * @param {array} properties - properties to assert types for
    * @return {undefined}
    */
    _checkTypes(params, properties) {
        properties.forEach(prop => {
            assert(params[prop] !== undefined, 'Push metric call must ' +
                `include an object with ${prop} property`);
            if (prop === 'bucket') {
                assert(typeof params[prop] === 'string', 'bucket property ' +
                    'must be a string');
            } else if (prop === 'oldByteLength') {
                assert(typeof params[prop] === 'number' ||
                    params[prop] === null, 'oldByteLength  property must be ' +
                    'an integer or `null`');
            } else {
                assert(typeof params[prop] === 'number', `${prop} property ` +
                    'must be an integer');
            }
        });
        return undefined;
    }

    /**
    * Generic method exposed by the client to push a metric with some values.
    * `params` can be expanded to provide metrics for other granularities
    * (e.g. service, account, user).
    * @param {string} metric - metric to be published
    * @param {string} reqUid - Request Unique Identifier
    * @param {object} params - params object with metric data
    * @param {string} params.bucket - bucket name
    * @param {number} params.byteLength - (optional) size of an object deleted
    * @param {number} params.newByteLength - (optional) new object size
    * @param {number|null} params.oldByteLength - (optional) old object size
    * (for object overwrites). This value can be `null` for a new object,
    * or >= 0 for an existing object with content-length 0 or greater than 0.
    * @param {number} params.numberOfObjects - (optional) number of obects
    * added/deleted
    * @param {callback} [cb] - (optional) callback to call
    * @return {object} this - current instance
    */
    pushMetric(metric, reqUid, params, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        this[methods[metric]](params, timestamp, log, callback);
        return this;
    }

    /**
    * Updates counter for CreateBucket action on a Bucket resource. Since create
    * bucket occcurs only once in a bucket's lifetime, counter is always 1
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricCreateBucket(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricCreateBucket',
            bucket, timestamp,
        });
        // set storage utilized and number of objects  counters to 0,
        // indicating the start of the bucket timeline
        const cmds = getBucketCounters(bucket).map(item => ['set', item, 0]);
        cmds.push(
            // remove old timestamp entries
            ['zremrangebyscore',
                genBucketStateKey(bucket, 'storageUtilized'), timestamp,
                timestamp],
            ['zremrangebyscore', genBucketStateKey(bucket, 'numberOfObjects'),
                timestamp, timestamp],
            // add new timestamp entries
            ['set', genBucketKey(bucket, 'createBucket', timestamp), 1],
            ['zadd', genBucketStateKey(bucket, 'storageUtilized'), timestamp,
                0],
            ['zadd', genBucketStateKey(bucket, 'numberOfObjects'), timestamp, 0]
        );
        return this.ds.batch(cmds, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricCreateBucket',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for DeleteBucket action on a Bucket resource
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricDeleteBucket(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteBucket',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'deleteBucket', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricDeleteBucket',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for DeleteBucketWebsite action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricDeleteBucketWebsite(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteBucketWebsite',
            bucket, timestamp });
        const key = genBucketKey(bucket, 'deleteBucketWebsite', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricDeleteBucketWebsite',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for ListBucket action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricListBucket(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListBucket',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'listBucket', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricListBucket',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for GetBucketAcl action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricGetBucketAcl(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', { method: 'UtapiClient.pushMetricGet' +
            'BucketAcl',
            bucket, timestamp });
        const key = genBucketKey(bucket, 'getBucketAcl', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricGetBucketAcl',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for GetBucketWebsite action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricGetBucketWebsite(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetBucketWebsite',
            bucket, timestamp });
        const key = genBucketKey(bucket, 'getBucketWebsite', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricGetBucketWebsite',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for PutBucketAcl action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricPutBucketAcl(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutBucketAcl', bucket, timestamp });
        const key = genBucketKey(bucket, 'putBucketAcl', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricPutBucketAcl',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for PutBucketWebsite action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricPutBucketWebsite(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutBucketWebsite',
            bucket, timestamp });
        const key = genBucketKey(bucket, 'putBucketWebsite', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricPutBucketWebsite',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for UploadPart action on an object in a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricUploadPart(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket', 'newByteLength']);
        const { bucket, newByteLength } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricUploadPart', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                newByteLength],
            ['incrby', genBucketKey(bucket, 'incomingBytes', timestamp),
                newByteLength],
            ['incr', genBucketKey(bucket, 'uploadPart', timestamp)],
        ], (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            // storage utilized counter
            const actionErr = results[0][0];
            const actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    metric: 'storage utilized',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }

            return this.ds.batch([
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, timestamp],
                ['zadd', genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, actionCounter],
            ], callback);
        });
    }

    /**
    * Updates counter for Initiate Multipart Upload action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricInitiateMultipartUpload(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricInitiateMultipartUpload',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'initiateMultipartUpload', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricInitiateMultipartUpload',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for Complete Multipart Upload action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricCompleteMultipartUpload(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricCompleteMultipartUpload',
            bucket, timestamp,
        });
        return this.ds.batch([
            ['incr', genBucketCounter(bucket, 'numberOfObjectsCounter')],
            ['incr', genBucketKey(bucket, 'completeMultipartUpload',
                timestamp)],
        ], (err, results) => {
            if (err) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricCompleteMultipartUpload',
                    metric: 'number of objects',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            // number of objects counter
            const actionErr = results[0][0];
            const actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricCompleteMultipartUpload',
                    metric: 'number of objects',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            const key = genBucketStateKey(bucket, 'numberOfObjects');
            return this.ds.batch([
                ['zremrangebyscore', key, timestamp, timestamp],
                ['zadd', key, timestamp, actionCounter],
            ], callback);
        });
    }

    /**
    * Updates counter for ListMultipartUploads action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricListBucketMultipartUploads(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListBucketMultipartUploads',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'listBucketMultipartUploads',
            timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricListBucketMultipart' +
                        'Uploads',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for ListMultipartUploadParts action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricListMultipartUploadParts(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListMultipartUploadParts',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'listMultipartUploadParts', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricListMultipartUpload' +
                        'Parts',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for AbortMultipartUpload action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricAbortMultipartUpload(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricAbortMultipartUpload',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'abortMultipartUpload', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricAbortMultipartUpload',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for DeleteObject or MultiObjectDelete action
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.byteLength - size of the object to delete
    * @param {number} params.numberOfObjects - number of objects deleted
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _genericPushMetricDeleteObject(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket', 'byteLength', 'numberOfObjects']);
        const { bucket, byteLength, numberOfObjects } = params;
        const bucketAction = numberOfObjects === 1 ? 'deleteObject'
            : 'multiObjectDelete';
        log.trace('pushing metric', {
            method: 'UtapiClient._genericPushMetricDeleteObject',
            bucket, timestamp,
        });
        return this.ds.batch([
            ['decrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                byteLength],
            ['decrby', genBucketCounter(bucket, 'numberOfObjectsCounter'),
                numberOfObjects],
            ['incr', genBucketKey(bucket, bucketAction, timestamp)],
        ], (err, results) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient._genericPushMetricDeleteObject',
                    error: err,
                });
                return callback(errors.InternalError);
            }

            const cmds = [];
            // storage utilized counter
            let actionErr = results[0][0];
            let actionCounter = parseInt(results[0][1], 10);
            actionCounter = actionCounter < 0 ? 0 : actionCounter;
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient._genericPushMetricDeleteObject',
                    metric: 'storage utilized',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            cmds.push(
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, timestamp],
                ['zadd',
                    genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, actionCounter]);

            // num of objects counter
            actionErr = results[1][0];
            actionCounter = parseInt(results[1][1], 10);
            actionCounter = actionCounter < 0 ? 0 : actionCounter;
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient._genericPushMetricDeleteObject',
                    metric: 'num of objects',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            cmds.push(
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'numberOfObjects'), timestamp,
                    timestamp],
                ['zadd', genBucketStateKey(bucket, 'numberOfObjects'),
                    timestamp, actionCounter]);
            return this.ds.batch(cmds, callback);
        });
    }


    /**
    * Updates counter for DeleteObject action on an object of Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.byteLength - size of the object deleted
    * @param {number} params.numberOfObjects - number of objects deleted
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricDeleteObject(params, timestamp, log, callback) {
        this._genericPushMetricDeleteObject(params, timestamp, log, callback);
        return undefined;
    }

    /**
    * Updates counter for MultiObjectDelete action
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.byteLength - size of the object deleted
    * @param {number} params.numberOfObjects - number of objects deleted
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricMultiObjectDelete(params, timestamp, log, callback) {
        this._genericPushMetricDeleteObject(params, timestamp, log, callback);
        return undefined;
    }

    /**
    * Updates counter for GetObject action on an object in a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricGetObject(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket', 'newByteLength']);
        const { bucket, newByteLength } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketKey(bucket, 'outgoingBytes', timestamp),
                newByteLength],
            ['incr', genBucketKey(bucket, 'getObject', timestamp)],
        ], err => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricGetObject',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for GetObjectAcl action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricGetObjectAcl(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObjectAcl',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'getObjectAcl', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricGetObjectAcl',
                    error: err,
                });
                return callback(err);
            }
            return callback();
        });
    }


    /**
    * Updates counter for PutObject action on an object in a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} params.oldByteLength - previous size of object
    * in bytes if this action overwrote an existing object
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricPutObject(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket', 'newByteLength', 'oldByteLength']);
        const { bucket, newByteLength, oldByteLength } = params;
        let numberOfObjectsCounter;
        // if previous object size is null then it's a new object in a bucket
        // or else it's an old object being overwritten
        if (oldByteLength === null) {
            numberOfObjectsCounter = ['incr', genBucketCounter(bucket,
                'numberOfObjectsCounter')];
        } else {
            numberOfObjectsCounter = ['get', genBucketCounter(bucket,
                'numberOfObjectsCounter')];
        }
        const oldObjSize = oldByteLength === null ? 0 : oldByteLength;
        const storageUtilizedDelta = newByteLength - oldObjSize;
        log.trace('pushing metric',
            { method: 'UtapiClient.pushMetricPutObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                storageUtilizedDelta],
            numberOfObjectsCounter,
            ['incrby', genBucketKey(bucket, 'incomingBytes', timestamp),
                newByteLength],
            ['incr', genBucketKey(bucket, 'putObject', timestamp)],
        ], (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            const cmds = [];
            let actionErr;
            let actionCounter;
            // storage utilized counter
            actionErr = results[0][0];
            actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'storage utilized',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            cmds.push(
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, timestamp],
                ['zadd', genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, actionCounter]);

            // number of objects counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'number of objects',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            cmds.push(
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'numberOfObjects'),
                    timestamp, timestamp],
                ['zadd', genBucketStateKey(bucket, 'numberOfObjects'),
                    timestamp, actionCounter]);
            return this.ds.batch(cmds, callback);
        });
    }

    /**
    * Updates counter for CopyObject action on an object in a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} params.newByteLength - size of object in bytes
    * @param {number} params.oldByteLength - previous size of object in bytes
    * if this action overwrote an existing object
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricCopyObject(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket', 'newByteLength', 'oldByteLength']);
        const { bucket, newByteLength, oldByteLength } = params;
        let numberOfObjectsCounter;
        // if previous object size is null then it's a new object in a bucket
        // or else it's an old object being overwritten
        if (oldByteLength === null) {
            numberOfObjectsCounter = ['incr', genBucketCounter(bucket,
                'numberOfObjectsCounter')];
        } else {
            numberOfObjectsCounter = ['get', genBucketCounter(bucket,
                'numberOfObjectsCounter')];
        }
        const oldObjSize = oldByteLength === null ? 0 : oldByteLength;
        const storageUtilizedDelta = newByteLength - oldObjSize;
        log.trace('pushing metric',
            { method: 'UtapiClient.pushMetricCopyObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                storageUtilizedDelta],
            numberOfObjectsCounter,
            ['incr', genBucketKey(bucket, 'copyObject', timestamp)],
        ], (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricCopyObject',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            const cmds = [];
            let actionErr;
            let actionCounter;
            // storage utilized counter
            actionErr = results[0][0];
            actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricCopyObject',
                    metric: 'storage utilized',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            cmds.push(
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, timestamp],
                ['zadd', genBucketStateKey(bucket, 'storageUtilized'),
                    timestamp, actionCounter]);

            // number of objects counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricCopyObject',
                    metric: 'number of objects',
                    error: actionErr,
                });
                return callback(errors.InternalError);
            }
            cmds.push(
                ['zremrangebyscore',
                    genBucketStateKey(bucket, 'numberOfObjects'),
                    timestamp, timestamp],
                ['zadd', genBucketStateKey(bucket, 'numberOfObjects'),
                    timestamp, actionCounter]);
            return this.ds.batch(cmds, callback);
        });
    }

    /**
    * Updates counter for PutObjectAcl action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricPutObjectAcl(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutObjectAcl',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'putObjectAcl', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricPutObjectAcl',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for HeadBucket action on a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricHeadBucket(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricHeadBucket',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'headBucket', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricHeadBucket',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }

    /**
    * Updates counter for HeadObject action on an object in a Bucket resource.
    * @param {object} params - params for the metrics
    * @param {string} params.bucket - bucket name
    * @param {number} timestamp - normalized timestamp of current time
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback to call
    * @return {undefined}
    */
    _pushMetricHeadObject(params, timestamp, log, callback) {
        this._checkTypes(params, ['bucket']);
        const { bucket } = params;
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricHeadObject',
            bucket, timestamp,
        });
        const key = genBucketKey(bucket, 'headObject', timestamp);
        return this.ds.incr(key, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricHeadObject',
                    error: err,
                });
                return callback(errors.InternalError);
            }
            return callback();
        });
    }
}
