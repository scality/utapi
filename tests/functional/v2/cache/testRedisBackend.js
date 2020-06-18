const assert = require('assert');
const uuid = require('uuid');
const { RedisCache } = require('../../../../libV2/cache').backends;
const { shardFromTimestamp } = require('../../../../libV2/utils');
const schema = require('../../../../libV2/cache/schema');
const { generateFakeEvents } = require('../../../utils/v2Data');

const startTime = new Date().getTime();
const endTime = startTime + 30000; // Add 30 seconds;
const testValues = generateFakeEvents(startTime, endTime, 50);

describe('test', async () => true);

describe('Test cache redis backend', () => {
    let cache;
    let prefix;
    beforeEach(async () => {
        prefix = uuid.v4();
        cache = new RedisCache({}, prefix);
        return cache.connect();
    });

    afterEach(async () => cache.disconnect());

    it('should create a new redis backend instance', () => {
        assert.equal(cache instanceof RedisCache, true);
    });

    testValues.map(event =>
        it('should set and get a key', async () => {
            const key = schema.getUtapiMetricKey('test', event);
            const res = await cache.setKey(key, JSON.stringify(event.getValue()));
            assert.strictEqual(res, true);
            const value = await cache.getKey(key);
            assert.deepStrictEqual(JSON.parse(value), event.getValue());
        }));

    testValues.map(event =>
        it('should add a key to a shard', async () => {
            const shard = shardFromTimestamp(event.timestamp);
            const res = await cache.addToShard(shard, event);
            assert.strictEqual(true, res);
        }));

    it('should fetch the keys in a shard', async () => {
        const shard = shardFromTimestamp(new Date().getTime());
        const expected = testValues.map(e =>
            schema.getUtapiMetricKey(prefix, e));
        await Promise.all(testValues.map(event => cache.addToShard(shard, event)));
        const keys = await cache.getKeysInShard(shard);
        assert.deepStrictEqual(keys.sort(), expected.sort());
    });

    it('should delete a shard and its keys', async () => {
        const shard = shardFromTimestamp(new Date().getTime());
        await Promise.all(testValues.map(event => cache.addToShard(shard, event)));
        await cache.deleteShardAndKeys(shard);
        const keys = await cache.getKeysInShard(shard);
        assert.deepStrictEqual(keys, []);
    });

    describe('Test shardExists', () => {
        it('should return false if the shard does not exists', async () => {
            const shard = shardFromTimestamp(new Date().getTime() + 10000);
            const res = await cache.shardExists(shard);
            assert.strictEqual(res, false);
        });

        it('should return true if the shard exists', async () => {
            const shard = shardFromTimestamp(new Date().getTime());
            await cache.addToShard(shard, testValues[0]);
            const res = await cache.shardExists(shard);
            assert(res, true);
        });
    });
});
