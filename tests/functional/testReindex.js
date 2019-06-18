const assert = require('assert');

const UtapiReindex = require('../../lib/UtapiReindex');
const redisClient = require('../../utils/redisClient');
const log = require('../utils/mock/log');

describe('UtapiReindex', () => {
    let reindex;
    let redis;

    beforeEach(done => {
        reindex = new UtapiReindex();
        redis = redisClient({}, log)
            .on('ready', done)
            .on('error', done);
    });

    afterEach(done => {
        redis.flushdb(done);
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
                reindex._lock()
                    .then(res => {
                        assert.strictEqual(res, 'OK');
                    })
                    .then(done)
                    .catch(done);
            });
        });

        describe('lock is already acquired', () => {
            beforeEach(done => {
                reindex._lock()
                    .then(res => {
                        assert.strictEqual(res, 'OK');
                    })
                    .then(done)
                    .catch(done);
            });

            it('should not acquire the lock key', done => {
                reindex._lock()
                    .then(res => {
                        assert.strictEqual(res, null);
                    })
                    .then(done)
                    .catch(done);
            });
        });
    });
});
