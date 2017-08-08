const assert = require('assert');
const async = require('async');
const { Logger } = require('werelogs');
const UtapiReplay = require('../../lib/UtapiReplay');
const UtapiClient = require('../../lib/UtapiClient');
const Datastore = require('../../lib/Datastore');
const redisClient = require('../../utils/redisClient');
const { getAllResourceTypeKeys } = require('../testUtils');
const safeJsonParse = require('../../utils/safeJsonParse');

const log = new Logger('UTAPIReplayTest');
const localCache = redisClient({
    host: '127.0.0.1',
    port: 6379,
}, log);
const datastore = new Datastore().setClient(localCache);
const utapiClient = new UtapiClient({
    redis: {
        host: '127.0.0.1',
        port: 4242, // Set the datastore client to a port it cannot connect on.
    },
    localCache: {
        host: '127.0.0.1',
        port: 6379, // Set the local cache a port for successful connection.
    },
    component: 's3',
});
const objSize = 1024;
// All actions supported by Utapi.
const actions = [
    'createBucket',
    'deleteBucket',
    'listBucket',
    'getBucketAcl',
    'putBucketAcl',
    'putBucketCors',
    'getBucketCors',
    'deleteBucketCors',
    'putBucketWebsite',
    'getBucketWebsite',
    'getBucketLocation',
    'deleteBucketWebsite',
    'uploadPart',
    'initiateMultipartUpload',
    'completeMultipartUpload',
    'listMultipartUploads',
    'listMultipartUploadParts',
    'abortMultipartUpload',
    'deleteObject',
    'multiObjectDelete',
    'getObject',
    'getObjectAcl',
    'getObjectTagging',
    'putObject',
    'copyObject',
    'putObjectAcl',
    'putObjectTagging',
    'deleteObjectTagging',
    'headBucket',
    'headObject',
    'putBucketVersioning',
    'getBucketVersioning',
    'putDeleteMarkerObject',
    'putBucketReplication',
    'getBucketReplication',
    'deleteBucketReplication',
];

// Get the proper params object for a pushMetric call for the given action.
function getParams(action) {
    const resources = {
        bucket: 'foo-bucket',
        accountId: 'foo-account',
        userId: 'foo-user',
    };
    switch (action) {
    case 'getObject':
        return Object.assign(resources, {
            newByteLength: objSize,
        });
    case 'uploadPart':
    case 'putObject':
    case 'copyObject':
        return Object.assign(resources, {
            newByteLength: objSize,
            oldByteLength: null,
        });
    case 'abortMultipartUpload':
        return Object.assign(resources, {
            byteLength: objSize,
        });
    case 'deleteObject':
        return Object.assign(resources, {
            byteLength: objSize,
            numberOfObjects: 1,
        });
    case 'multiObjectDelete':
        return Object.assign(resources, {
            byteLength: objSize,
            numberOfObjects: 2,
        });
    default:
        return resources;
    }
}

// Check that a list element has the correct data to make a pushMetric call.
function checkListElement(action, params, res) {
    const { error, result } = safeJsonParse(res);
    assert(!error, 'cannot parse cached element into JSON');
    const { reqUid, timestamp } = result;
    const currTimestamp = UtapiClient.getNormalizedTimestamp();
    const fifteenMinutes = 900000; // Milliseconds.
    // Allow for previous timestamp interval, since we cannot know start time.
    assert(timestamp, currTimestamp || currTimestamp - fifteenMinutes,
        'incorrect timestamp value');
    assert(reqUid !== undefined,
        `reqUid property not in cached element: ${action}`);
    const reqLog = log.newRequestLoggerFromSerializedUids(reqUid);
    const reqUids = reqLog.getSerializedUids();
    // The first two reqUidss should be those in the response.
    const expectedReqUid = reqUids.substring(0, reqUids.lastIndexOf(':'));
    // We want the action and original params for use during the replay.
    assert.deepStrictEqual(result, {
        action,
        reqUid: expectedReqUid,
        params,
        timestamp,
    }, `incorrect value for action: ${action}`);
}

// Check the length of the local cache list.
function checkListLength(expectedLength, cb) {
    return datastore.llen('s3:utapireplay', (err, res) => {
        if (err) {
            return cb(err);
        }
        assert.strictEqual(res, expectedLength,
            `expected list length to be ${expectedLength}`);
        return cb();
    });
}

// Push each metric to the local cache list.
function pushAllMetrics(cb) {
    return async.eachSeries(actions, (action, next) => {
        const reqLog = log.newRequestLogger();
        const reqUid = reqLog.getSerializedUids();
        const params = getParams(action);
        return utapiClient.pushMetric(action, reqUid, params, err => {
            // We want a simulated internal error.
            if (err && !err.InternalError) {
                return next(err);
            }
            return datastore.lrange('s3:utapireplay', 0, 0, (err, res) => {
                if (err) {
                    return next(err);
                }
                checkListElement(action, params, res);
                return next();
            });
        });
    }, err => {
        if (err) {
            return cb(err);
        }
        return checkListLength(actions.length, cb);
    });
}

// Pop each metric from the local cache list.
function popAllMetrics(cb) {
    return async.eachSeries(actions, (action, next) => {
        datastore.rpop('s3:utapireplay', (err, res) => {
            if (err) {
                return next(err);
            }
            checkListElement(action, getParams(action), res);
            return next();
        });
    }, err => {
        if (err) {
            return cb(err);
        }
        return checkListLength(0, cb);
    });
}

// Checks that all schema keys are stored with the correct values. Note that the
// putDeleteMarkerObject method increments both the number of objects and
// deleteObject metric
function checkAllMetrics(cb) {
    const keys = getAllResourceTypeKeys();
    return async.each(keys, (key, next) =>
        datastore.get(key, (err, res) => {
            if (err) {
                return next(err);
            }
            let expected = 1; // Actions should have been incremented once.
            if (key.includes('incomingBytes')) {
                expected = objSize * 2; // putObject and uploadPart.
            } else if (key.includes('outgoingBytes')) {
                expected = objSize; // getObject.
            } else if (key.includes('storageUtilized')) {
                expected = 0; // After PUT and DELETE operations, should be 0.
            } else if (key.includes('numberOfObjects')) {
                expected = 1; // After PUT and DELETE operations, should be 1.
            } else if (key.endsWith('DeleteObject')) {
                expected = 2; // After DELETE operations, should be 2.
            }
            assert.strictEqual(parseInt(res, 10), expected, 'incorrect value ' +
                `of key: ${key}`);
            return next();
        }), err => cb(err));
}

describe('Replay', () => {
    describe('Local cache list', () => {
        after(() => localCache.flushdb());

        it('should push all metrics to the local cache list', done =>
            pushAllMetrics(done));

        it('should pop all metrics from the local cache list', done =>
            popAllMetrics(done));
    });

    describe('UtapiReplay', () => {
        const TTL = 60 * 15; // fifteen minutes
        // Set redis to correct port so replay successfully pushes metrics.
        const replay = new UtapiReplay({
            redis: { host: '127.0.0.1', port: 6379 },
            replaySchedule: '*/1 * * * * *', // Run replay every second.
            localCache: {
                host: '127.0.0.1',
                port: 6379,
            },
        });
        // Set the replay lock before the replay job for the first test.
        before(() => datastore.setExpire('s3:utapireplay:lock', 'true', TTL)
            .then(() => replay.start()));
        beforeEach(done => pushAllMetrics(done));
        afterEach(() => localCache.flushdb());

        it('should not push any cached metrics when replay lock is set',
            function callback(done) {
                this.timeout(5000);
                // Give time to ensure a replay job has time to complete.
                return setTimeout(() =>
                    checkListLength(actions.length, done), 3000);
            });

        it('should record all metrics from the local cache as schema keys',
            function callback(done) {
                this.timeout(5000);
                // Give time to ensure a replay job has time to complete.
                return setTimeout(() => checkAllMetrics(err => {
                    if (err) {
                        return done(err);
                    }
                    return checkListLength(0, done);
                }), 3000);
            });
    });
});
