const assert = require('assert');
const { map, series } = require('async');
const UtapiClient = require('../../lib/UtapiClient');
const Datastore = require('../../lib/Datastore');
const redisClient = require('../../utils/redisClient');
const { Logger } = require('werelogs');
const { getCounters, getMetricFromKey,
    getStateKeys } = require('../../lib/schema');
const log = new Logger('TestUtapiClient');
const redis = redisClient({
    host: '127.0.0.1',
    port: 6379,
}, log);
const datastore = new Datastore().setClient(redis);
const utapiClient = new UtapiClient({
    redis: {
        host: '127.0.0.1',
        port: 6379,
    },
    localCache: {
        host: '127.0.0.1',
        port: 6379,
    },
    component: 's3',
});
const reqUid = 'foo';
const metricTypes = {
    bucket: 'foo-bucket',
    accountId: 'foo-account',
    userId: 'foo-user',
    service: 's3',
};
const putOperations = ['PutObject', 'CopyObject', 'UploadPart',
    'CompleteMultipartUpload'];

// Get the metric object for the given type
function _getMetricObj(type) {
    const levels = {
        bucket: 'buckets',
        accountId: 'accounts',
        userId: 'users',
        service: 'service',
    };
    const obj = {
        level: levels[type],
        service: 's3',
    };
    obj[type] = metricTypes[type];
    return obj;
}

function _assertCounters(metricObj, valueObj, cb) {
    const counters = getCounters(metricObj);
    return map(counters, (item, cb) =>
        datastore.get(item, (err, res) => {
            if (err) {
                return cb(err);
            }
            const metric = getMetricFromKey(item);
            assert.strictEqual(parseInt(res, 10), valueObj[metric],
                `${metric} must be ${valueObj[metric]}`);
            return cb();
        }), cb);
}

function _assertStateKeys(metricObj, valueObj, cb) {
    const stateKeys = getStateKeys(metricObj);
    return map(stateKeys, (item, cb) =>
        datastore.zrange(item, 0, -1, (err, res) => {
            if (err) {
                return cb(err);
            }
            const metric = getMetricFromKey(item);
            assert.strictEqual(parseInt(res[0], 10), valueObj[metric],
                `${metric} must be ${valueObj[metric]}`);
            return cb();
        }), cb);
}

// Simulates a scenario in which two objects are deleted prior to any put object
// operations, resulting in -20 `storageUtilized` value and -2 `numberOfObjects`
// value. This could occur if the connection to the Redis server is interrupted.
function _checkMissingOperations(assertKeys, metricObj, operation, valuesObject,
    cb) {
    return series([
        next => utapiClient.pushMetric('createBucket', reqUid, metricObj, next),
        next => utapiClient.pushMetric('multiObjectDelete', reqUid,
            Object.assign(metricObj, {
                byteLength: 20,
                numberOfObjects: 2,
            }), next),
        next => {
            switch (operation) {
            case 'PutObject':
                return utapiClient.pushMetric('putObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 9,
                        oldByteLength: null,
                    }), next);
            case 'CopyObject':
                return utapiClient.pushMetric('copyObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 9,
                        oldByteLength: null,
                    }), next);
            case 'UploadPart':
                return utapiClient.pushMetric('uploadPart', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 9,
                        oldByteLength: null,
                    }), next);
            case 'CompleteMultipartUpload':
                return utapiClient.pushMetric('uploadPart', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 9,
                        oldByteLength: null,
                    }), utapiClient.pushMetric('completeMultipartUpload',
                        reqUid, metricObj, next));
            default:
                return next();
            }
        },
    ], () => assertKeys(metricObj, valuesObject, cb));
}

Object.keys(metricTypes).forEach(type => {
    if (metricTypes[type] === undefined) {
        return;
    }
    const metricObj = _getMetricObj(type);
    describe(`Counters with ${type} metrics`, () => {
        afterEach(() => redis.flushdb());

        it('should reconcile counters for out of order operations ', done => {
            series([
                next => utapiClient.pushMetric('deleteObject', reqUid,
                    Object.assign(metricObj, {
                        byteLength: 8,
                        numberOfObjects: 1,
                    }), next),
                next => utapiClient.pushMetric('createBucket', reqUid,
                    metricObj, next),
                next => utapiClient.pushMetric('listBucket', reqUid, metricObj,
                    next),
                next => utapiClient.pushMetric('putObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 8,
                        oldByteLength: null,
                    }), next),
                next => utapiClient.pushMetric('putObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 8,
                        oldByteLength: null,
                    }), next),
                next => utapiClient.pushMetric('getObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 8,
                    }), next),
                next => utapiClient.pushMetric('deleteBucket', reqUid,
                    metricObj, next),
            ], () => _assertCounters(metricObj, {
                storageUtilized: 8,
                numberOfObjects: 1,
            }, done));
        });

        putOperations.forEach(op => {
            // Calculated based on negative counter values.
            const counterKeyVals = op === 'UploadPart' ? {
                storageUtilized: -11,
                numberOfObjects: -2, // UploadPart does not increment value.
            } : {
                storageUtilized: -11,
                numberOfObjects: -1,
            };
            it(`should record correct values if counters are < 0: ${op}`,
                done => _checkMissingOperations(_assertCounters, metricObj, op,
                    counterKeyVals, done));
        });
    });

    describe(`State keys with ${type} metrics`, () => {
        afterEach(() => redis.flushdb());

        putOperations.forEach(op => {
            // Calculated based on negative counter values.
            const stateKeyVals = op === 'UploadPart' ? {
                storageUtilized: 9,
                numberOfObjects: 0, // UploadPart does not increment value.
            } : {
                storageUtilized: 9,
                numberOfObjects: 1,
            };
            it(`should record correct values if counters are < 0: ${op}`,
                done => _checkMissingOperations(_assertStateKeys, metricObj, op,
                    stateKeyVals, done));
        });
    });
});
