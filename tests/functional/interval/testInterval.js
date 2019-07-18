const assert = require('assert');
const async = require('async');
const uuid = require('uuid/v4');

const UtapiClient = require('../../../lib/UtapiClient');
const mock = require('../../utils/mock');
const { makeUtapiClientRequest } = require('../../utils/utils');
const redisClient = require('../../../utils/redisClient');

describe('UtapiClient: Across time intervals', function test() {
    this.timeout((1000 * 60) * 2);

    const redis = redisClient({
        host: '127.0.0.1',
        port: 6379,
    }, mock.log);

    const utapi = new UtapiClient({
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

    function waitUntilNextInterval() {
        const start = UtapiClient.getNormalizedTimestamp();
        while (start === UtapiClient.getNormalizedTimestamp()) {
            setTimeout(() => {}, 500);
        }
    }

    const vault = new mock.Vault();

    before(() => {
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
        utapi.pushMetric('putObject', uuid(), params, cb);
    }

    function deleteObject(cb) {
        const params = {
            level: 'buckets',
            service: 's3',
            bucket: 'my-bucket',
            byteLength: 10,
            numberOfObjects: 1,
        };
        utapi.pushMetric('deleteObject', uuid(), params, cb);
    }

    let firstInterval;
    let secondInterval;

    describe('Metrics do not return to same values', () => {
        beforeEach(done => {
            async.series([
                next => {
                    waitUntilNextInterval();
                    firstInterval = UtapiClient.getNormalizedTimestamp();
                    async.series([
                        next => putObject(next),
                        next => putObject(next),
                    ], next);
                },
                next => {
                    waitUntilNextInterval();
                    secondInterval = UtapiClient.getNormalizedTimestamp();
                    async.series([
                        next => putObject(next),
                        next => putObject(next),
                        next => deleteObject(next),
                    ], next);
                },
            ], done);
        });

        it('should maintain data points', done => {
            async.series([
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
                    const seconds = (5 * 1000) - 1;
                    const params = {
                        timeRange: [secondInterval, secondInterval + seconds],
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
            async.series([
                next => {
                    waitUntilNextInterval();
                    firstInterval = UtapiClient.getNormalizedTimestamp();
                    async.series([
                        next => putObject(next),
                        next => putObject(next),
                    ], next);
                },
                next => {
                    waitUntilNextInterval();
                    secondInterval = UtapiClient.getNormalizedTimestamp();
                    async.series([
                        next => putObject(next),
                        next => deleteObject(next),
                    ], next);
                },
            ], done);
        });

        it('should maintain data points', done => {
            async.series([
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
                    const seconds = (5 * 1000) - 1;
                    const params = {
                        timeRange: [secondInterval, secondInterval + seconds],
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
