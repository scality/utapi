const assert = require('assert');

const async = require('async');

const UtapiReindex = require('../../lib/UtapiReindex');
const redisClient = require('../../utils/redisClient');
const mock = require('../utils/mock');
const utils = require('../utils/utils');

const REINDEX_LOCK_KEY = 's3:utapireindex:lock';

describe('UtapiReindex', () => {
    const vault = new mock.Vault();
    const bucketD = new mock.BucketD();
    let reindex;
    let redis;

    function shouldAcquireLock(done) {
        reindex._lock()
            .then(res => {
                assert.strictEqual(res, 'OK');
            })
            .then(done)
            .catch(done);
    }

    function shouldNotAcquireLock(done) {
        reindex._lock()
            .then(res => {
                assert.strictEqual(res, null);
            })
            .then(done)
            .catch(done);
    }

    function shouldReleaseLock(done) {
        reindex._unLock()
            .then(res => {
                assert.strictEqual(res, 1);
            })
            .then(done)
            .catch(done);
    }

    function shouldNotReleaseLock(done) {
        reindex._unLock()
            .then(res => {
                assert.strictEqual(res, 0);
            })
            .then(done)
            .catch(done);
    }

    before(() => {
        bucketD.start();
        vault.start();
    });

    after(() => {
        bucketD.end();
        vault.end();
    });

    beforeEach(done => {
        reindex = new UtapiReindex();
        redis = redisClient({}, mock.log)
            .on('ready', done)
            .on('error', done);
    });

    afterEach(done => {
        redis
            .on('close', done)
            .on('error', done)
            .flushdb()
            .then(() => redis.quit())
            .catch(done);
    });

    describe('::_getRedisClient', () => {
        it('should get a new redis client', done => {
            reindex._getRedisClient()
                .on('ready', done)
                .on('error', done);
        });
    });

    describe('::_connect', () => {
        it('should connect to the redis sentinel', done => {
            reindex._connect(done);
        });
    });

    describe('::_lock', () => {
        beforeEach(done => {
            reindex._connect(done);
        });

        describe('lock is not acquired', () => {
            it('should acquire the lock key', done => {
                shouldAcquireLock(done);
            });
        });

        describe('lock is already acquired', () => {
            beforeEach(done => {
                shouldAcquireLock(done);
            });

            it('should not acquire the lock key', done => {
                shouldNotAcquireLock(done);
            });
        });
    });

    describe('::_unlock', () => {
        beforeEach(done => {
            reindex._connect(done);
        });

        describe('lock is not acquired', () => {
            it('should not release lock key', done => {
                shouldNotReleaseLock(done);
            });
        });

        describe('lock is already acquired', () => {
            beforeEach(done => {
                shouldAcquireLock(done);
            });

            it('should not acquire the lock key', done => {
                shouldReleaseLock(done);
            });
        });
    });

    describe('::_attemptLock', () => {
        beforeEach(done => {
            reindex._connect(done);
        });

        describe('lock is not acquired', () => {
            it('should call the job', done => {
                const job = () => {
                    done();
                };
                reindex._attemptLock(job);
            });
        });

        describe('lock is already acquired', () => {
            beforeEach(done => {
                shouldAcquireLock(done);
            });

            it('should not call the job', done => {
                const job = () => {
                    done(new Error('job called when lock was not acquired'));
                };
                reindex._attemptLock(job);
                setTimeout(done, 200);
            });
        });
    });

    describe('::_attemptUnlock', () => {
        beforeEach(done => {
            reindex._connect(done);
        });

        describe('lock is already acquired', () => {
            beforeEach(done => {
                shouldAcquireLock(done);
            });

            it('should release the lock key', done => {
                reindex._attemptUnlock(); // Lock should be released here.
                setTimeout(() => shouldNotReleaseLock(done), 200);
            });
        });
    });

    describe('::_scheduleJob', () => {
        function waitUntilLockHasValue({ value }, cb) {
            let shouldWait;

            async.doUntil(next =>
                redis.get(REINDEX_LOCK_KEY, (err, res) => {
                    if (err) {
                        return next(err);
                    }
                    shouldWait = res === value;
                    return setTimeout(next, 200);
                }),
            () => shouldWait, cb);
        }

        function checkMetrics({ resource, expected }, cb) {
            utils.listMetrics(resource, (err, res) => {
                if (err) {
                    return cb(err);
                }
                if (res.code) {
                    return cb(new Error(res.message));
                }
                const { storageUtilized, numberOfObjects } = expected;
                assert.deepStrictEqual(res[0].storageUtilized, storageUtilized);
                assert.deepStrictEqual(res[0].numberOfObjects, numberOfObjects);
                return cb();
            });
        }

        beforeEach(done => {
            reindex._scheduleJob();
            // Wait until the scripts have started and finsihed reindexing.
            async.series([
                next => waitUntilLockHasValue({ value: 'true' }, next),
                next => waitUntilLockHasValue({ value: null }, next),
            ], done);
        });

        it('should reindex metrics', done => {
            async.parallel([
                next => {
                    const params = {
                        resource: {
                            type: 'buckets',
                            buckets: ['test-bucket'],
                        },
                        expected: {
                            storageUtilized: [0, 1024],
                            numberOfObjects: [0, 1],
                        },
                    };
                    checkMetrics(params, next);
                },
                next => {
                    const params = {
                        resource: {
                            type: 'buckets',
                            buckets: ['mpuShadowBuckettest-bucket'],
                        },
                        expected: {
                            storageUtilized: [0, 1024],
                            numberOfObjects: [0, 1],
                        },
                    };
                    checkMetrics(params, next);
                },
                next => {
                    const params = {
                        resource: {
                            type: 'accounts',
                            accounts: ['014810915030'],
                        },
                        expected: {
                            storageUtilized: [0, 2048],
                            numberOfObjects: [0, 2],
                        },
                    };
                    checkMetrics(params, next);
                },
            ], done);
        });
    });
});
