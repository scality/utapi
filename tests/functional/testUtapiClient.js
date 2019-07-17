const assert = require('assert');
const { map, series, waterfall, each } = require('async');
const UtapiClient = require('../../lib/UtapiClient');
const Datastore = require('../../lib/Datastore');
const redisClient = require('../../utils/redisClient');
const { Logger } = require('werelogs');
const { getCounters, getMetricFromKey,
    getStateKeys, getKeys } = require('../../lib/schema');

const { makeUtapiClientRequest } = require('../utils/utils');
const Vault = require('../utils/mock/Vault');

const log = new Logger('TestUtapiClient');
const redis = redisClient({
    host: '127.0.0.1',
    port: 6379,
}, log);
const datastore = new Datastore().setClient(redis);
const utapiConfig = {
    redis: {
        host: '127.0.0.1',
        port: 6379,
    },
    localCache: {
        host: '127.0.0.1',
        port: 6379,
    },
    component: 's3',
};
const utapiClient = new UtapiClient(utapiConfig);
const utapiClientExp = new UtapiClient(Object.assign({ expireMetrics: true,
    expireMetricsTTL: 0 }, utapiConfig));
const reqUid = 'foo';
const metricTypes = {
    bucket: 'foo-bucket',
    accountId: 'foo-account',
    userId: 'foo-user',
    service: 's3',
};
const putOperations = ['PutObject', 'CopyObject', 'UploadPart',
    'UploadPartCopy', 'CompleteMultipartUpload'];

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

function _seedMetrics(metricObj, cb) {
    series([
        next => utapiClientExp.pushMetric('createBucket', reqUid, metricObj,
            next),
        next => utapiClientExp.pushMetric('listBucket', reqUid, metricObj,
            next),
        next => utapiClientExp.pushMetric('putObject', reqUid,
            Object.assign(metricObj, {
                newByteLength: 8,
                oldByteLength: null,
            }), next),
        next => utapiClientExp.pushMetric('deleteBucket', reqUid,
            metricObj, next),
    ], cb);
}

function _assertExpiredKeys(metricObj, type, cb) {
    let keys;
    switch (type) {
    case 'stateful keys':
        keys = getStateKeys(metricObj);
        break;
    case 'api counters':
        keys = getKeys(metricObj);
        break;
    case 'global counters':
        keys = getCounters(metricObj);
        break;
    default:
        throw new Error('unrecognized key type');
    }
    if (type === 'globalcounters') {
        return map(keys,
            (item, next) => datastore.get(item, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, null);
                next();
            }),
            cb);
    }
    return map(keys, (item, next) =>
        datastore.zrange(item, 0, -1, (err, res) => {
            if (err) {
                return next(err);
            }
            assert.deepStrictEqual(res, []);
            return next();
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
            case 'UploadPartCopy':
                return utapiClient.pushMetric('uploadPartCopy', reqUid,
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
            const counterKeyVals =
            (op === 'UploadPart' || op === 'UploadPartCopy') ? {
                storageUtilized: -11,
                numberOfObjects: -2, // Uploading parts do not increment value.
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
            const stateKeyVals =
            (op === 'UploadPart' || op === 'UploadPartCopy') ? {
                storageUtilized: 9,
                numberOfObjects: 0, // Uploading parts do not increment value.
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

describe('UtapiClient: expire bucket metrics', () => {
    afterEach(() => redis.flushdb());

    ['stateful keys', 'api counters', 'global counters'].forEach(item => {
        it(`should expire bucket level ${item}`, done => {
            const metricObj = _getMetricObj('bucket');
            _seedMetrics(metricObj, err => {
                assert.ifError(err);
                _assertExpiredKeys(metricObj, item, done);
            });
        });
    });

    ['accountId', 'userId', 'service'].forEach(level => {
        it(`should not expire global counters ${level} level`, done => {
            const metricObj = _getMetricObj(level);
            _seedMetrics(metricObj, err => {
                assert.ifError(err);
                _assertCounters(metricObj, {
                    storageUtilized: 8,
                    numberOfObjects: 1,
                }, done);
            });
        });
    });

    describe('with a non-zero TTL', () => {
        const TTL = 10;

        beforeEach(done => {
            const config = Object.assign({
                expireMetrics: true,
                expireMetricsTTL: TTL,
            }, utapiConfig);
            const client = new UtapiClient(config);
            const params = _getMetricObj('bucket');

            series([
                next => {
                    client.ds.getClient()
                        .on('ready', next)
                        .on('error', next);
                },
                next =>
                    client.pushMetric('createBucket', reqUid, params, next),
                next =>
                    client.pushMetric('deleteBucket', reqUid, params, next),
            ], done);
        });

        it(`should have a TTL > than 0 and <= ${TTL}`, done => {
            function assertTTL(keys, cb) {
                each(keys, (key, next) =>
                    redis.ttl(key, (err, data) => {
                        if (err) {
                            return next(err);
                        }
                        assert(data > 0 && data <= TTL);
                        return next();
                    }),
                cb);
            }
            waterfall([
                next => redis.keys('s3:buckets:*', next),
                (keys, next) => {
                    assert.strictEqual(keys.length, 2);
                    assertTTL(keys, next);
                },
            ], done);
        });
    });
});

describe.only('Across time intervals', function test() {
    this.timeout((1000 * 60) * 2);

    function checkMetricResponse(response, expected) {
        const data = JSON.parse(response);
        if (data.code) {
            assert.ifError(data.message);
        }
        const { storageUtilized, numberOfObjects, incomingBytes } = data[0];
        assert.deepStrictEqual(storageUtilized, expected.storageUtilized);
        assert.deepStrictEqual(numberOfObjects, expected.numberOfObjects);
        assert.strictEqual(incomingBytes, expected.incomingBytes);
    }

    function getNormalizedTimestampSeconds() {
        const d = new Date();
        const seconds = d.getSeconds();
        return d.setSeconds((seconds - seconds % 15), 0, 0);
    }

    function waitUntilNextInterval() {
        const start = getNormalizedTimestampSeconds();
        while (start === getNormalizedTimestampSeconds()) {
            setTimeout(() => {}, 500);
        }
    }

    const vault = new Vault();

    before(() => {
        process.env.TIMESTAMP_INTERVAL = 'hello';
        vault.start();
    });

    after(() => {
        vault.end();
    });
    
    afterEach(() => redis.flushdb());

    function putObject(cb) {
        const params = {
            level: 'buckets',
            service: 's3',
            bucket: 'my-bucket',
            newByteLength: 10,
            oldByteLength: null,
        };
        utapiClient.pushMetric('putObject', reqUid, params, cb);
    }

    function deleteObject(cb) {
        const params = {
            level: 'buckets',
            service: 's3',
            bucket: 'my-bucket',
            byteLength: 10,
            numberOfObjects: 1,
        };
        utapiClient.pushMetric('deleteObject', reqUid, params, cb);
    }

    let firstInterval;
    let secondInterval;

    describe('Metrics do not return to same values', () => {
        beforeEach(done => {
            series([
                next => {
                    waitUntilNextInterval();
                    firstInterval = getNormalizedTimestampSeconds();
                    series([
                        next => putObject(next),
                        next => putObject(next),
                    ], next);
                },
                next => {
                    waitUntilNextInterval();
                    secondInterval = getNormalizedTimestampSeconds();
                    series([
                        next => putObject(next),
                        next => putObject(next),
                        next => deleteObject(next),
                    ], next);
                },
            ], done);
        });

        it('should maintain data points', done => {
            series([
                next => {
                    const params = {
                        timeRange: [firstInterval, secondInterval - 1],
                        resource: {
                            type: 'buckets',
                            buckets: ['my-bucket'],
                        },
                    };
                    makeUtapiClientRequest(params, (err, response) => {
                        assert.ifError(err);
                        const expected = {
                            storageUtilized: [20, 20],
                            numberOfObjects: [2, 2],
                            incomingBytes: 20,
                        };
                        checkMetricResponse(response, expected);
                        return next();
                    });
                },
                next => {
                    const params = {
                        timeRange: [secondInterval, secondInterval + 14999],
                        resource: {
                            type: 'buckets',
                            buckets: ['my-bucket'],
                        },
                    };
                    makeUtapiClientRequest(params, (err, response) => {
                        assert.ifError(err);
                        const expected = {
                            storageUtilized: [30, 30],
                            numberOfObjects: [3, 3],
                            incomingBytes: 20,
                        };
                        checkMetricResponse(response, expected);
                        return next();
                    });
                },
            ], done);
        });
    });

    describe('Metrics return to same values', () => {
        beforeEach(done => {
            series([
                next => {
                    waitUntilNextInterval();
                    firstInterval = getNormalizedTimestampSeconds();
                    series([
                        next => putObject(next),
                        next => putObject(next),
                    ], next);
                },
                next => {
                    waitUntilNextInterval();
                    secondInterval = getNormalizedTimestampSeconds();
                    series([
                        next => putObject(next),
                        next => deleteObject(next),
                    ], next);
                },
            ], done);
        });

        it('should maintain data points', done => {
            series([
                next => {
                    const params = {
                        timeRange: [firstInterval, secondInterval - 1],
                        resource: {
                            type: 'buckets',
                            buckets: ['my-bucket'],
                        },
                    };
                    makeUtapiClientRequest(params, (err, response) => {
                        assert.ifError(err);
                        const expected = {
                            storageUtilized: [20, 20],
                            numberOfObjects: [2, 2],
                            incomingBytes: 20,
                        };
                        checkMetricResponse(response, expected);
                        return next();
                    });
                },
                next => {
                    const params = {
                        timeRange: [secondInterval, secondInterval + 14999],
                        resource: {
                            type: 'buckets',
                            buckets: ['my-bucket'],
                        },
                    };
                    makeUtapiClientRequest(params, (err, response) => {
                        assert.ifError(err);
                        const expected = {
                            storageUtilized: [20, 20],
                            numberOfObjects: [2, 2],
                            incomingBytes: 10,
                        };
                        checkMetricResponse(response, expected);
                        return next();
                    });
                },
            ], done);
        });
    });
});