import { Logger } from 'werelogs';
import Datastore from './Datastore';
import { genBucketKey, genBucketCounter, getBucketCounters, genBucketStateKey }
    from './schema';
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
    * Normalizes timestamp precision to a 15 minutes interval to
    * reduce the number of entries in a sorted set
    * @return {object} normalizedTime - normalized time
    * @property {number} normalizedTime.timestamp - normalized to the
    * nearest 15 minutes interval
    * @property {number} normalizedTime.timespan - normalized to the date
    */
    static getNormalizedTime() {
        const d = new Date();
        const minutes = d.getMinutes();
        const timestamp = d.setMinutes((minutes - minutes % 15), 0, 0);
        const timespan = d.setHours(0, 0);
        return { timestamp, timespan };
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricCreateBucket',
            bucket, timestamp,
        });
        const cmds = [];
        // set counters to 0 except for create bucket counter (set to 1)
        // indicating start of bucket timeline
        getBucketCounters(bucket).forEach(item => {
            if (item.indexOf('CreateBucket:counter') !== -1) {
                cmds.push(['set', item, 1]);
            } else {
                cmds.push(['set', item, 0]);
            }
        });
        cmds.push(
            // remove old timestamp entries
            ['zremrangebyscore', genBucketKey(bucket, 'createBucket', timespan),
                timestamp, timestamp],
            ['zremrangebyscore',
                genBucketStateKey(bucket, 'storageUtilized'), timestamp,
                timestamp],
            ['zremrangebyscore', genBucketStateKey(bucket, 'numberOfObjects'),
                timestamp, timestamp],
            // add new timestamp entries
            ['zadd', genBucketKey(bucket, 'createBucket', timespan), timestamp,
                1],
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
                return callback(err);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteBucket',
            bucket, timestamp,
        });
        const key = genBucketCounter(bucket, 'deleteBucketCounter');
        return this.ds.set(key, 1, err => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricDeleteBucket',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [
                ['zremrangebyscore',
                    genBucketKey(bucket, 'deleteBucket', timespan), timestamp,
                    timestamp],
                ['zadd', genBucketKey(bucket, 'deleteBucket', timespan),
                    timestamp, 1],
            ];
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListBucket',
            bucket, timestamp,
        });
        return this.ds.incr(genBucketCounter(bucket, 'listBucketCounter'),
            (err, count) => {
                if (err) {
                    log.error('error incrementing counter', {
                        method: 'Buckets.pushMetricListBucket',
                        error: err,
                    });
                    return callback(err);
                }
                const cmds = [
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'listBucket', timespan), timestamp,
                        timestamp],
                    ['zadd', genBucketKey(bucket, 'listBucket', timespan),
                        timestamp, count],
                ];
                return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', { method: 'UtapiClient.pushMetricGet' +
            'BucketAcl',
            bucket, timestamp });
        const key = genBucketCounter(bucket, 'getBucketAclCounter');
        return this.ds.incr(key, (err, count) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricGetBucketAcl',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [
                ['zremrangebyscore',
                    genBucketKey(bucket, 'getBucketAcl', timespan), timestamp,
                    timestamp],
                ['zadd', genBucketKey(bucket, 'getBucketAcl', timespan),
                    timestamp, count],
            ];
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutBucketAcl', bucket, timestamp });
        const key = genBucketCounter(bucket, 'putBucketAclCounter');
        return this.ds.incr(key, (err, count) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'Buckets.pushMetricPutBucketAcl',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [
                ['zremrangebyscore',
                    genBucketKey(bucket, 'putBucketAcl', timespan),
                    timestamp, timestamp],
                ['zadd', genBucketKey(bucket, 'putBucketAcl', timespan),
                    timestamp, count],
            ];
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricUploadPart', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                objectSize],
            ['incrby', genBucketCounter(bucket, 'incomingBytesCounter'),
                objectSize],
            ['incr', genBucketCounter(bucket, 'uploadPartCounter')],
        ], (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [];
            let actionErr;
            let actionCounter;
            // storage utilized counter
            actionErr = results[0][0];
            actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    metric: 'storage utilized',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'storageUtilized'),
                        timestamp, timestamp],
                    ['zadd',
                        genBucketStateKey(bucket, 'storageUtilized'),
                        timestamp, actionCounter]
                );
            }

            // incoming bytes counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    metric: 'incoming bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'incomingBytes'),
                        timestamp, timestamp],
                    ['zadd', genBucketStateKey(bucket, 'incomingBytes'),
                        timestamp, actionCounter]);
            }
            // uploadPart counter
            actionErr = results[2][0];
            actionCounter = results[2][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    metric: 'uploadPart',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'uploadPart', timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'uploadPart', timespan),
                        timestamp, actionCounter]);
            }
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricInitiateMultipartUpload',
            bucket, timestamp,
        });
        const key = genBucketCounter(bucket, 'initiateMultipartUploadCounter');
        return this.ds.incr(key, (err, count) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricInitiateMultipartUpload',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [
                ['zremrangebyscore',
                    genBucketKey(bucket, 'initiateMultipartUpload', timespan),
                    timestamp, timestamp],
                ['zadd',
                    genBucketKey(bucket, 'initiateMultipartUpload', timespan),
                    timestamp, count],
            ];
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricCompleteMultipartUpload',
            bucket, timestamp,
        });
        return this.ds.batch([
            ['incr', genBucketCounter(bucket, 'numberOfObjectsCounter')],
            ['incr',
                genBucketCounter(bucket, 'completeMultipartUploadCounter')],
        ], (err, results) => {
            // number of objects counter
            if (err) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'number of objects',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [];
            let actionErr;
            let actionCounter;
            // storage utilized counter
            actionErr = results[0][0];
            actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricCompleteMultipartUpload',
                    metric: 'number of objects',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'numberOfObjects'),
                        timestamp, timestamp],
                    ['zadd', genBucketStateKey(bucket, 'numberOfObjects'),
                        timestamp, actionCounter]);
            }

            // completeMultipartUpload counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricCompleteMultipartUpload',
                    metric: 'number of objects',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'completeMultipartUpload',
                            timespan),
                        timestamp, timestamp],
                    ['zadd',
                        genBucketKey(bucket, 'completeMultipartUpload',
                            timespan),
                        timestamp, actionCounter]);
            }
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListBucketMultipartUploads',
            bucket, timestamp,
        });
        return this.ds.incr(
            genBucketCounter(bucket, 'listBucketMultipartUploadsCounter'),
            (err, count) => {
                if (err) {
                    log.error('error incrementing counter', {
                        method: 'UtapiClient.pushMetricListBucketMultipart' +
                            'Uploads',
                        error: err,
                    });
                    return callback(err);
                }
                const cmds = [
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'listBucketMultipartUploads',
                            timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'listBucketMultipartUploads',
                        timespan),
                        timestamp, count],
                ];
                return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListMultipartUploadParts',
            bucket, timestamp,
        });
        return this.ds.incr(
            genBucketCounter(bucket, 'listMultipartUploadPartsCounter'),
            (err, count) => {
                if (err) {
                    log.error('error incrementing counter', {
                        method: 'UtapiClient.pushMetricListMultipartUpload' +
                            'Parts',
                        error: err,
                    });
                    return callback(err);
                }
                const cmds = [
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'listMultipartUploadParts',
                            timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'listMultipartUploadParts',
                        timespan),
                        timestamp, count],
                ];
                return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricAbortMultipartUpload',
            bucket, timestamp,
        });
        const key = genBucketCounter(bucket, 'abortMultipartUploadCounter');
        return this.ds.incr(key, (err, count) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricAbortMultipartUpload',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [
                ['zremrangebyscore',
                    genBucketKey(bucket, 'abortMultipartUpload', timespan),
                    timestamp, timestamp],
                ['zadd', genBucketKey(bucket, 'abortMultipartUpload', timespan),
                    timestamp, count],
            ];
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteObject',
            bucket, timestamp,
        });
        return this.ds.batch([
            ['decrby', genBucketCounter(bucket, 'storageUtilizedCounter'),
                objectSize],
            ['incr', genBucketCounter(bucket, 'deleteObjectCounter')],
            ['decr', genBucketCounter(bucket, 'numberOfObjectsCounter')],
        ], (err, results) => {
            if (err || results[0][0]) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricDeleteObject',
                    error: err,
                });
                return callback(err);
            }

            const cmds = [];
            // storage utilized counter
            let actionErr = results[0][0];
            let tempCounter = parseInt(results[0][1], 10);
            tempCounter = tempCounter < 0 ? 0 : tempCounter;
            let actionCounter = parseInt(results[0][1], 10);
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricDeleteObject',
                    metric: 'storage utilized',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'storageUtilized', timespan),
                        timestamp, timestamp],
                    ['zadd',
                        genBucketStateKey(bucket, 'storageUtilized', timespan),
                        timestamp, tempCounter]);
            }

            // del object counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricDeleteObject',
                    metric: 'delete object',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'deleteObject', timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'deleteObject', timespan),
                        timestamp, actionCounter]);
            }

            // num of objects counter
            actionErr = results[2][0];
            tempCounter = parseInt(results[2][1], 10);
            tempCounter = tempCounter < 0 ? 0 : tempCounter;
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricDeleteObject',
                    metric: 'num of objects',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'numberOfObjects'), timestamp,
                        timestamp],
                    ['zadd', genBucketStateKey(bucket, 'numberOfObjects'),
                        timestamp, tempCounter]);
            }
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', genBucketCounter(bucket, 'outgoingBytesCounter'),
            objectSize],
            ['incr', genBucketCounter(bucket, 'outgoingBytesCounter')],
        ], (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricGetObject',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [];
            // storage utilized counter
            let actionErr = results[0][0];
            let actionCounter = results[0][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricGetObject',
                    metric: 'outgoing bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'outgoingBytes'),
                        timestamp, timestamp],
                    ['zadd', genBucketStateKey(bucket, 'outgoingBytes'),
                        timestamp, actionCounter]);
            }

            // get object counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricGetObject',
                    metric: 'outgoing bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'getObject', timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'getObject', timespan),
                        timestamp, actionCounter]);
            }
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObjectAcl',
            bucket, timestamp,
        });
        const key = genBucketCounter(bucket, 'getObjectAclCounter');
        return this.ds.incr(key, (err, count) => {
            if (err) {
                log.error('error incrementing counter', {
                    method: 'UtapiClient.pushMetricGetObjectAcl',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [
                ['zremrangebyscore',
                    genBucketKey(bucket, 'getObjectAcl', timespan), timestamp,
                    timestamp],
                ['zadd', genBucketKey(bucket, 'getObjectAcl', timespan),
                    timestamp, count],
            ];
            return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
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
            ['incrby', genBucketCounter(bucket, 'incomingBytesCounter'),
                objectSize],
            numberOfObjectsCounter,
            ['incr', genBucketCounter(bucket, 'putObjectCounter')],
        ], (err, results) => {
            if (err) {
                log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    error: err,
                });
                return callback(err);
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
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'storageUtilized', timespan),
                        timestamp, timestamp],
                    ['zadd',
                        genBucketStateKey(bucket, 'storageUtilized', timespan),
                        timestamp, actionCounter]);
            }

            // incoming bytes counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'incoming bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'incomingBytes'),
                        timestamp, timestamp],
                    ['zadd', genBucketStateKey(bucket, 'incomingBytes'),
                        timestamp, actionCounter]);
            }

            // number of objects counter
            actionErr = results[2][0];
            actionCounter = results[2][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'number of objects',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketStateKey(bucket, 'numberOfObjects'),
                        timestamp, timestamp],
                    ['zadd', genBucketStateKey(bucket, 'numberOfObjects'),
                        timestamp, actionCounter]);
            }

            // putObject counter
            actionErr = results[3][0];
            actionCounter = results[3][1];
            if (actionErr) {
                log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'put object',
                    error: actionErr,
                });
            } else {
                cmds.push(
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'putObject', timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'putObject', timespan),
                        timestamp, actionCounter]);
            }
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutObjectAcl',
            bucket, timestamp,
        });
        return this.ds.incr(genBucketCounter(bucket, 'putObjectAclCounter'),
            (err, count) => {
                if (err) {
                    log.error('error incrementing counter', {
                        method: 'UtapiClient.pushMetricPutObjectAcl',
                        error: err,
                    });
                    return callback(err);
                }
                const cmds = [
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'putObjectAcl', timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'putObjectAcl', timespan),
                        timestamp, count],
                ];
                return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricHeadBucket',
            bucket, timestamp,
        });
        return this.ds.incr(genBucketCounter(bucket, 'headBucketCounter'),
            (err, count) => {
                if (err) {
                    log.error('error incrementing counter', {
                        method: 'UtapiClient.pushMetricHeadBucket',
                        error: err,
                    });
                    return callback(err);
                }
                const cmds = [
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'headBucket', timespan), timestamp,
                        timestamp],
                    ['zadd', genBucketKey(bucket, 'headBucket', timespan),
                        timestamp, count],
                ];
                return this.ds.batch(cmds, callback);
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
        const { timespan, timestamp } = UtapiClient.getNormalizedTime();
        log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricHeadObject',
            bucket, timestamp,
        });
        return this.ds.incr(genBucketCounter(bucket, 'headObjectCounter'),
            (err, count) => {
                if (err) {
                    log.error('error incrementing counter', {
                        method: 'UtapiClient.pushMetricHeadObject',
                        error: err,
                    });
                    return callback(err);
                }
                const cmds = [
                    ['zremrangebyscore',
                        genBucketKey(bucket, 'headObject', timespan),
                        timestamp, timestamp],
                    ['zadd', genBucketKey(bucket, 'headObject', timespan),
                        timestamp, count],
                ];
                return this.ds.batch(cmds, callback);
            });
    }
}
