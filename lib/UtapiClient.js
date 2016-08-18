import { Logger } from 'werelogs';
import Datastore from './Datastore';
import { genBucketKey } from './schema';
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
        return this.ds.zadd(genBucketKey(bucket, 'createBucket'), timestamp,
            1, callback);
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
             ['set', genBucketKey(bucket, 'bucketStorageUtilizedCounter'), 0],
             ['set', genBucketKey(bucket, 'bucketIncomingBytesCounter'), 0],
             ['set', genBucketKey(bucket, 'bucketOutgoingBytesCounter'), 0],
             ['set', genBucketKey(bucket, 'bucketNumberOfObjectsCounter'), 0],
             ['zadd', genBucketKey(bucket, 'deleteBucket'), timestamp, 1],
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
        return this.ds.zadd(genBucketKey(bucket, 'listBucket'), timestamp, 1,
            callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'getBucketAcl'), timestamp,
            1, callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'putBucketAcl'), timestamp,
            1, callback);
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
            ['incrby', genBucketKey(bucket, 'bucketStorageUtilizedCounter'),
                objectSize],
            ['incrby', genBucketKey(bucket, 'bucketIncomingBytesCounter'),
                objectSize],
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
                cmds.push(['zadd',
                    genBucketKey(bucket, 'storageUtilized'),
                    timestamp, actionCounter]);
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
                cmds.push(['zadd',
                    genBucketKey(bucket, 'incomingBytes'),
                    timestamp, actionCounter]);
            }

            // number of logUploadPart actions
            cmds.push(['zadd', genBucketKey(bucket, 'uploadPart'), timestamp,
                1]);
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
        return this.ds.zadd(genBucketKey(bucket, 'initiateMultipartUpload'),
            timestamp, 1, callback);
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
        return this.ds.incr(
            genBucketKey(bucket, 'bucketNumberOfObjectsCounter'),
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
                cmds.push(['zadd', genBucketKey(bucket, 'numberOfObjects'),
                    timestamp, objCount]);
                // number of PutObject actions
                cmds.push(['zadd',
                    genBucketKey(bucket, 'completeMultipartUpload'),
                    timestamp, 1]);
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
        return this.ds.zadd(
            genBucketKey(bucket, 'listBucketMultipartUploads'),
            timestamp, 1, callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'listMultipartUploadParts'),
            timestamp, 1, callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'abortMultipartUpload'),
            timestamp, 1, callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'deleteObject'), timestamp,
            1, callback);
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
            ['incrby', genBucketKey(bucket, 'bucketOutgoingBytesCounter'),
            objectSize],
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
                cmds.push(['zadd',
                    genBucketKey(bucket, 'outgoingBytes'),
                    timestamp, actionCounter]);
            }

            // number of GetObject actions
            cmds.push(['zadd', genBucketKey(bucket, 'getObject'), timestamp,
                1]);
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
        return this.ds.zadd(genBucketKey(bucket, 'getObjectAcl'), timestamp,
            1, callback);
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
            ['incrby', genBucketKey(bucket, 'bucketStorageUtilizedCounter'),
                objectSize],
            ['incrby', genBucketKey(bucket, 'bucketIncomingBytesCounter'),
                objectSize],
            ['incr', genBucketKey(bucket, 'bucketNumberOfObjectsCounter')],
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
                cmds.push(['zadd',
                    genBucketKey(bucket, 'storageUtilized'),
                    timestamp, actionCounter]);
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
                cmds.push(['zadd',
                    genBucketKey(bucket, 'incomingBytes'),
                    timestamp, actionCounter]);
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
                cmds.push(['zadd',
                    genBucketKey(bucket, 'numberOfObjects'), timestamp,
                    actionCounter]);
            }
            // number of PutObject actions
            cmds.push(['zadd', genBucketKey(bucket, 'putObject'), timestamp,
                1]);
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
        return this.ds.zadd(genBucketKey(bucket, 'putObjectAcl'), timestamp,
            1, callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'headBucket'), timestamp, 1,
            callback);
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
        return this.ds.zadd(genBucketKey(bucket, 'headObject'), timestamp, 1,
            callback);
    }
}
