import assert from 'assert';
import { map, series } from 'async';
import UtapiClient from '../../src/lib/UtapiClient';
import Datastore from '../../src/lib/Datastore';
import redisClient from '../../src/utils/redisClient';
import { Logger } from 'werelogs';
import { getBucketCounters, getMetricFromKey,
    getBucketStateKeys } from '../../src/lib/schema';
const testBucket = 'foo';
const datastore = new Datastore();
const utapiClient = new UtapiClient();
const reqUid = 'foo';
const redis = redisClient({ host: '127.0.0.1', port: 6379 }, Logger);
const putOperations = ['PutObject', 'CopyObject', 'UploadPart',
    'CompleteMultipartUpload'];

datastore.setClient(redis);
utapiClient.setDataStore(datastore);

function _assertCounters(bucket, valueObj, cb) {
    const counters = getBucketCounters(testBucket);
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

function _assertStateKeys(bucket, valueObj, cb) {
    const stateKeys = getBucketStateKeys(testBucket);
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
function _checkMissingOperations(assertKeys, operation, valuesObject, cb) {
    return series([
        next => utapiClient.pushMetricCreateBucket(reqUid, testBucket, next),
        next => utapiClient.pushMetricMultiObjectDelete(reqUid, testBucket, 20,
            2, next),
        next => {
            switch (operation) {
            case 'PutObject':
                return utapiClient.pushMetricPutObject(reqUid, testBucket, 9,
                        null, next);
            case 'CopyObject':
                return utapiClient.pushMetricCopyObject(reqUid, testBucket, 9,
                    null, next);
            case 'UploadPart':
                return utapiClient.pushMetricUploadPart(reqUid, testBucket, 9,
                    next);
            case 'CompleteMultipartUpload':
                return utapiClient.pushMetricUploadPart(reqUid, testBucket, 9,
                    utapiClient.pushMetricCompleteMultipartUpload(reqUid,
                        testBucket, next));
            default:
                return next();
            }
        },
    ], () => assertKeys(testBucket, valuesObject, cb));
}

describe('Counters', () => {
    afterEach(() => redis.flushdb());

    it('should set counters to 0 on bucket creation', done => {
        utapiClient.pushMetricCreateBucket(reqUid, testBucket,
            () => _assertCounters(testBucket, {
                storageUtilized: 0,
                numberOfObjects: 0,
            }, done));
    });

    it('should reset counters on bucket re-creation', done => {
        series([
            next => utapiClient.pushMetricCreateBucket(reqUid, testBucket,
                next),
            next => utapiClient.pushMetricListBucket(reqUid, testBucket, next),
            next => utapiClient.pushMetricPutObject(reqUid, testBucket, 8, 0,
                next),
            next => utapiClient.pushMetricGetObject(reqUid, testBucket, 8,
                next),
            next => utapiClient.pushMetricDeleteObject(reqUid, testBucket, 8,
                next),
            next => utapiClient.pushMetricDeleteBucket(reqUid, testBucket,
                next),
            next => utapiClient.pushMetricCreateBucket(reqUid, testBucket,
                next),
        ], () => _assertCounters(testBucket, {
            storageUtilized: 0,
            numberOfObjects: 0,
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
        it(`should record correct values if counters are < 0: ${op}`, done =>
            _checkMissingOperations(_assertCounters, op, counterKeyVals, done));
    });
});

describe('State keys', () => {
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
        it(`should record correct values if counters are < 0: ${op}`, done =>
            _checkMissingOperations(_assertStateKeys, op, stateKeyVals, done));
    });
});
