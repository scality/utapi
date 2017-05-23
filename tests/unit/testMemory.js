const assert = require('assert');
const MemoryBackend = require('../../lib/backend/Memory');


describe('Test Memory Backend', () => {
    let mem;
    beforeEach(() => {
        mem = new MemoryBackend();
    });
    it('should create a new memory backend instance', () => {
        assert.equal(mem instanceof MemoryBackend, true);
    });

    it('should store a value at a key', done => {
        const key = 'foo';
        const value = 'bar';
        mem.set(key, value, (err, res) => {
            assert.strictEqual(err, null);
            assert.strictEqual(value, res);

            const db = mem.getDb();
            const expectedRes = {};
            expectedRes[key] = value;
            assert.deepStrictEqual(db, expectedRes);
            done();
        });
    });

    it('should get value stored at a key', done => {
        const key = 'foo';
        const value = 'bar';
        mem.set(key, value, () => {
            mem.get(key, (err, res) => {
                assert.strictEqual(err, null);
                assert.strictEqual(value, res);
                done();
            });
        });
    });

    it('should increment value stored at a key', done => {
        const key = 'foo';
        const value = 100;
        const expectedRes = (value + 1).toString();
        mem.set(key, value, () => {
            mem.incr(key, (err, res) => {
                assert.strictEqual(err, null);
                assert.strictEqual(res, expectedRes);
                done();
            });
        });
    });

    it('should increment to 1 for a new key', done => {
        const key = 'foo';
        mem.incr(key, (err, res) => {
            assert.strictEqual(err, null);
            assert.strictEqual(res, '1');
            done();
        });
    });

    it('should increment value stored at a key by a given number', done => {
        const key = 'foo';
        const value = 100;
        const incrbyVal = 10;
        const expectedRes = (value + incrbyVal).toString();
        mem.set(key, value, () => {
            mem.incrby(key, incrbyVal, (err, res) => {
                assert.strictEqual(err, null);
                assert.strictEqual(res, expectedRes);
                done();
            });
        });
    });

    it('should decrement the value of a key', done => {
        const key = 'foo';
        const value = 100;
        const expectedRes = (value - 1).toString();
        mem.set(key, value, () => {
            mem.decr(key, (err, res) => {
                assert.strictEqual(err, null);
                assert.strictEqual(res, expectedRes);
                done();
            });
        });
    });

    it('should decrement to -1 for a new key', done => {
        const key = 'foo';
        mem.decr(key, (err, res) => {
            assert.strictEqual(err, null);
            assert.strictEqual(res, '-1');
            done();
        });
    });

    it('should decrement value stored at a key by a given number', done => {
        const key = 'foo';
        const value = 100;
        const decrbyVal = 10;
        const expectedRes = (value - decrbyVal).toString();
        mem.set(key, value, () => {
            mem.decrby(key, decrbyVal, (err, res) => {
                assert.strictEqual(err, null);
                assert.strictEqual(res, expectedRes);
                done();
            });
        });
    });

    it('should add a member with score to a sorted set', done => {
        const key = 'foo';
        const value = 100;
        const d = new Date();
        const score = d.setMinutes(0, 0, 0);
        mem.zadd(key, score, value, (err, res) => {
            assert.strictEqual(err, null);
            assert.strictEqual(res, value.toString());
            const db = mem.getDb();
            const expectedRes = {};
            expectedRes[key] = [[score, value.toString()]];
            assert.deepStrictEqual(db, expectedRes);
            done();
        });
    });

    it('should return members that have a score between min and max', done => {
        const key = 'foo';
        const values = [100, 101, 102];
        const d = new Date();
        const scores = [d.setMinutes(0, 0, 0) + 1, d.setMinutes(0, 0, 0) + 2,
            d.setMinutes(0, 0, 0) + 3];
        mem.zadd(key, scores[0], values[0], () => {
            mem.zadd(key, scores[1], values[1], () => {
                mem.zadd(key, scores[2], values[2], () => {
                    mem.zrangebyscore(key, scores[0], scores[2], (err, res) => {
                        assert.strictEqual(err, null);
                        const expectedRes = values.map(i => i.toString());
                        assert.deepStrictEqual(res, expectedRes);
                        done();
                    });
                });
            });
        });
    });

    it('should return members by the reverse ordering of scores', done => {
        const key = 'foo';
        const values = [100, 101, 102];
        const d = new Date();
        const scores = [d.setMinutes(0, 0, 0) + 1, d.setMinutes(0, 0, 0) + 2,
            d.setMinutes(0, 0, 0) + 3];
        mem.zadd(key, scores[0], values[0], () => {
            mem.zadd(key, scores[1], values[1], () => {
                mem.zadd(key, scores[2], values[2], () => {
                    mem.zrevrangebyscore(key, scores[2], scores[0],
                        (err, res) => {
                            assert.strictEqual(err, null);
                            values.sort((a, b) => b - a);
                            const expectedRes = values.map(i => i.toString());
                            assert.deepStrictEqual(res, expectedRes);
                            done();
                        });
                });
            });
        });
    });

    it('should delete members that fall between min and max scores', done => {
        const key = 'foo';
        const values = [100, 101, 102];
        const d = new Date();
        d.setMinutes(0, 0, 0);
        const scores = [d.getTime() + 1, d.getTime() + 2, d.getTime() + 3];
        const removeCount = 2;
        mem.zadd(key, scores[0], values[0], () => {
            mem.zadd(key, scores[1], values[1], () => {
                mem.zadd(key, scores[2], values[2], () => {
                    mem.zremrangebyscore(key, scores[0], scores[1],
                        (err, res) => {
                            assert.strictEqual(err, null);
                            assert.strictEqual(res, removeCount);

                            const db = mem.getDb();
                            assert.deepStrictEqual(db[key],
                                [[scores[2], values[2].toString()]]);
                            done();
                        });
                });
            });
        });
    });

    it('should execute a batch of commands', done => {
        const key = 'foo';
        const val = 100;
        const valStr = val.toString();
        const valIncr = (val + 1).toString();
        const expectedRes = [[null, valStr], [null, valIncr], [null, valIncr]];
        mem.multi([
            ['set', key, val],
            ['incr', key],
            ['get', key],
        ]).exec((err, res) => {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(res, expectedRes);
            done();
        });
    });
});
