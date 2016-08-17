import Redis from 'ioredis';
import { Logger } from 'werelogs';
import Datastore from './Datastore';
import { createBucket, deleteBucket, listBucket, getBucketAcl, putBucketAcl,
    bucketStorageUtilized, bucketStorageUtilizedCounter, bucketIncomingBytes,
    bucketIncomingBytesCounter, bucketNumberOfObjects,
    bucketNumberOfObjectsCounter, bucketOutgoingBytesCounter,
    listBucketMultipartUploads, listMultipartUploadParts, abortMultipartUpload,
    deleteObject, bucketOutgoingBytes, getObject, getObjectAcl, putObjectAcl,
    putObject, uploadPart, initiateMultipartUpload, completeMultipartUpload,
    headBucket, headObject,
} from './schema';

export default class UtapiClient {
    constructor(config) {
        this.disableClient = true;
        if (config) {
            const { redis } = config;
            if (redis) {
                // when redis server is unavailable, commands are added to an
                // offline queue and processed when redis is back again
                // TODO: need to revisit this. It needs to be verified if this
                // option is hogging memory under heavy load when redis is
                // unavailable
                redis.enableOfflineQueue = true;
                // keep alive 3 seconds
                redis.keepAlive = 3000;
                const redisClient = new Redis(redis);
                this.ds = new Datastore().setClient(redisClient);
                this.disableClient = false;
                this.log = new Logger('UtapiClient',
                    config.log || { level: 'info', dump: 'error' });
            }
        }
    }

    /*
    * Utility function to use when callback is not defined
    */
    _noop() {}

    /**
    * Updates counter for CreateBucket action on a Bucket resource. Since create
    * bucket occcurs only once in a bucket's lifetime, counter is  always 1
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricCreateBucket(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricCreateBucket',
            bucket, timestamp,
        });
        return this.ds.zadd(createBucket(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for DeleteBucket action on a Bucket resource. Since delete
    * bucket occcurs only once in a bucket's lifetime, counter is  always 1
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricDeleteBucket(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteBucket',
            bucket, timestamp,
        });
        // clear global counters and log the action
        return this.ds.batch([
             ['set', bucketStorageUtilizedCounter(bucket), 0],
             ['set', bucketIncomingBytesCounter(bucket), 0],
             ['set', bucketOutgoingBytesCounter(bucket), 0],
             ['set', bucketNumberOfObjectsCounter(bucket), 0],
             ['zadd', deleteBucket(bucket), timestamp, 1],
        ], callback);
    }


    /**
    * Updates counter for ListBucket action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricListBucket(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListBucket',
            bucket, timestamp,
        });
        return this.ds.zadd(listBucket(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for GetBucketAcl action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricGetBucketAcl(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', { method: 'UtapiClient.pushMetricGet' +
            'BucketAcl',
            bucket, timestamp });
        return this.ds.zadd(getBucketAcl(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for PutBucketAcl action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricPutBucketAcl(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutBucketAcl', bucket, timestamp });
        return this.ds.zadd(putBucketAcl(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for UploadPart action on an object in a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {number} objectSize - size of object in bytes
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricUploadPart(bucket, timestamp, objectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricUploadPart', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', bucketStorageUtilizedCounter(bucket), objectSize],
            ['incrby', bucketIncomingBytesCounter(bucket), objectSize],
        ], (err, results) => {
            if (err) {
                this.log.error('error pushing metric', {
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
                this.log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    metric: 'storage utilized',
                    error: actionErr,
                });
            } else {
                cmds.push(['zadd', bucketStorageUtilized(bucket), timestamp,
                    actionCounter]);
            }

            // incoming bytes counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                this.log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricUploadPart',
                    metric: 'incoming bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(['zadd', bucketIncomingBytes(bucket), timestamp,
                    actionCounter]);
            }

            // number of logUploadPart actions
            cmds.push(['zadd', uploadPart(bucket), timestamp, 1]);
            return this.ds.batch(cmds, callback);
        });
    }

    /**
    * Updates counter for Initiate Multipart Upload action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricInitiateMultipartUpload(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricInitiateMultipartUpload',
            bucket, timestamp,
        });
        return this.ds.zadd(initiateMultipartUpload(bucket), timestamp, 1,
            callback);
    }

    /**
    * Updates counter for Complete Multipart Upload action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricCompleteMultipartUpload(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricCompleteMultipartUpload',
            bucket, timestamp,
        });
        return this.ds.incr(bucketNumberOfObjectsCounter(bucket),
            (err, objCount) => {
                // number of objects counter
                if (err) {
                    this.log.error('error incrementing counter for push metric',
                        {
                            method: 'UtapiClient.pushMetricPutObject',
                            metric: 'number of objects',
                            error: err,
                        });
                    return callback(err);
                }
                const cmds = [];
                cmds.push(['zadd', bucketNumberOfObjects(bucket), timestamp,
                    objCount]);
                // number of PutObject actions
                cmds.push(['zadd', completeMultipartUpload(bucket), timestamp,
                    1]);
                return this.ds.batch(cmds, callback);
            });
    }

    /**
    * Updates counter for ListMultipartUploads action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricListBucketMultipartUploads(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListBucketMultipartUploads',
            bucket, timestamp,
        });
        return this.ds.zadd(listBucketMultipartUploads(bucket), timestamp, 1,
            callback);
    }

    /**
    * Updates counter for ListMultipartUploadParts action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricListMultipartUploadParts(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricListMultipartUploadParts',
            bucket, timestamp,
        });
        return this.ds.zadd(listMultipartUploadParts(bucket), timestamp, 1,
            callback);
    }

    /**
    * Updates counter for AbortMultipartUpload action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricAbortMultipartUpload(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricAbortMultipartUpload',
            bucket, timestamp,
        });
        return this.ds.zadd(abortMultipartUpload(bucket), timestamp, 1,
            callback);
    }

    /**
    * Updates counter for DeleteObject action on an object of Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricDeleteObject(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricDeleteObject',
            bucket, timestamp,
        });
        return this.ds.zadd(deleteObject(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for GetObject action on an object in a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {number} objectSize - size of object in bytes
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricGetObject(bucket, timestamp, objectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', bucketOutgoingBytesCounter(bucket), objectSize],
        ], (err, results) => {
            if (err) {
                this.log.error('error pushing metric', {
                    method: 'UtapiClient.pushMetricGetObject',
                    error: err,
                });
                return callback(err);
            }
            const cmds = [];
            // storage utilized counter
            const actionErr = results[0][0];
            const actionCounter = results[0][1];
            if (actionErr) {
                this.log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricGetObject',
                    metric: 'outgoing bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(['zadd', bucketOutgoingBytes(bucket), timestamp,
                    actionCounter]);
            }

            // number of GetObject actions
            cmds.push(['zadd', getObject(bucket), timestamp, 1]);
            return this.ds.batch(cmds, callback);
        });
    }

    /**
    * Updates counter for GetObjectAcl action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricGetObjectAcl(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricGetObjectAcl',
            bucket, timestamp,
        });
        return this.ds.zadd(getObjectAcl(bucket), timestamp, 1, callback);
    }


    /**
    * Updates counter for PutObject action on an object in a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {number} objectSize - size of object in bytes
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricPutObject(bucket, timestamp, objectSize, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric',
            { method: 'UtapiClient.pushMetricPutObject', bucket, timestamp });
        // update counters
        return this.ds.batch([
            ['incrby', bucketStorageUtilizedCounter(bucket), objectSize],
            ['incrby', bucketIncomingBytesCounter(bucket), objectSize],
            ['incr', bucketNumberOfObjectsCounter(bucket)],
        ], (err, results) => {
            if (err) {
                this.log.error('error pushing metric', {
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
                this.log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'storage utilized',
                    error: actionErr,
                });
            } else {
                cmds.push(['zadd', bucketStorageUtilized(bucket), timestamp,
                    actionCounter]);
            }

            // incoming bytes counter
            actionErr = results[1][0];
            actionCounter = results[1][1];
            if (actionErr) {
                this.log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'incoming bytes',
                    error: actionErr,
                });
            } else {
                cmds.push(['zadd', bucketIncomingBytes(bucket), timestamp,
                    actionCounter]);
            }

            // number of objects counter
            actionErr = results[2][0];
            actionCounter = results[2][1];
            if (actionErr) {
                this.log.error('error incrementing counter for push metric', {
                    method: 'UtapiClient.pushMetricPutObject',
                    metric: 'number of objects',
                    error: actionErr,
                });
            } else {
                cmds.push(['zadd', bucketNumberOfObjects(bucket), timestamp,
                    actionCounter]);
            }
            // number of PutObject actions
            cmds.push(['zadd', putObject(bucket), timestamp, 1]);
            return this.ds.batch(cmds, callback);
        });
    }

    /**
    * Updates counter for PutObjectAcl action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricPutObjectAcl(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricPutObjectAcl',
            bucket, timestamp,
        });
        return this.ds.zadd(putObjectAcl(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for HeadBucket action on a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricHeadBucket(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricHeadBucket',
            bucket, timestamp,
        });
        return this.ds.zadd(headBucket(bucket), timestamp, 1, callback);
    }

    /**
    * Updates counter for HeadObject action on an object in a Bucket resource.
    * @param {string} bucket - bucket name
    * @param {number} timestamp - unix epoch timestamp
    * @param {callback} [cb] - (optional) callback to call
    * @return {undefined}
    */
    pushMetricHeadObject(bucket, timestamp, cb) {
        const callback = cb || this._noop;
        if (this.disableClient) {
            return callback();
        }
        this.log.trace('pushing metric', {
            method: 'UtapiClient.pushMetricHeadObject',
            bucket, timestamp,
        });
        return this.ds.zadd(headObject(bucket), timestamp, 1, callback);
    }
}
