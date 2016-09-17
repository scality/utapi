import { Logger } from 'werelogs';
import Datastore from './Datastore';
import { genBucketKey, genBucketCounter, getBucketCounters, genBucketStateKey }
    from './schema';
import { errors } from 'arsenal';
import redisClient from '../utils/redisClient';

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
    * Updates counter for CreateBucket action on a Bucket resource. Since create
    * bucket occcurs only once in a bucket's lifetime, counter is  always 1
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricCreateBucket(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricDeleteBucket(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * Updates counter for ListBucket action on a Bucket resource.
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricListBucket(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricGetBucketAcl(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * Updates counter for PutBucketAcl action on a Bucket resource.
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricPutBucketAcl(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * Updates counter for UploadPart action on an object in a Bucket resource.
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {number} objectSize - size of object in bytes
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricUploadPart(reqUid, bucket, objectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricUploadPart', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                objectSize],
            ['incrby', genBucketKey(bucket, 'incomingBytes', timestamp),
                objectSize],
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricInitiateMultipartUpload(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricCompleteMultipartUpload(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricListBucketMultipartUploads(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricListMultipartUploadParts(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricAbortMultipartUpload(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * Updates counter for DeleteObject action on an object of Bucket resource.
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {number} objectSize - size of the object
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricDeleteObject(reqUid, bucket, objectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteObject',
            bucket, timestamp,
        });
        return this.ds.batch([
            ['decrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                objectSize],
            ['decr', genBucketCounter(bucket, 'numberOfObjectsCounter')],
            ['incr', genBucketKey(bucket, 'deleteObject', timestamp)],
        ], (err, results) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricDeleteObject',
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
                    method: 'UtapiClient.pushMetricDeleteObject',
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
                    method: 'UtapiClient.pushMetricDeleteObject',
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
    * Updates counter for GetObject action on an object in a Bucket resource.
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {number} objectSize - size of object in bytes
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricGetObject(reqUid, bucket, objectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketKey(bucket, 'outgoingBytes', timestamp),
                objectSize],
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricGetObjectAcl(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {number} objectSize - size of object in bytes
    * @param {number} prevObjectSize - previous size of object in bytes if this
    * action overwrote an existing object
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricPutObject(reqUid, bucket, objectSize, prevObjectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
        let numberOfObjectsCounter;
        // if previous object size is null then it's a new object in a bucket
        // or else it's an old object being overwritten
        if (prevObjectSize === null) {
            numberOfObjectsCounter = ['incr', genBucketCounter(bucket,
                'numberOfObjectsCounter')];
        } else {
            numberOfObjectsCounter = ['get', genBucketCounter(bucket,
                'numberOfObjectsCounter')];
        }
        let oldObjSize = parseInt(prevObjectSize, 10);
        oldObjSize = isNaN(oldObjSize) ? 0 : oldObjSize;
        let newObjSize = parseInt(objectSize, 10);
        newObjSize = isNaN(newObjSize) ? 0 : newObjSize;
        const storageUtilizedDelta = newObjSize - oldObjSize;
        log.trace('pushing metric',
            { method: 'UtapiClient.pushMetricPutObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                storageUtilizedDelta],
            numberOfObjectsCounter,
            ['incrby', genBucketKey(bucket, 'incomingBytes', timestamp),
                objectSize],
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
    * Updates counter for PutObjectAcl action on a Bucket resource.
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricPutObjectAcl(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricHeadBucket(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
    * @param {string} reqUid - Request Unique Identifier
    * @param {string} bucket - bucket name
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricHeadObject(reqUid, bucket, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        const log = this.log.newRequestLoggerFromSerializedUids(reqUid);
        const timestamp = UtapiClient.getNormalizedTimestamp();
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
