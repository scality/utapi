const assert = require('assert');
const { MemoryCache } = require('../../../../libV2/cache').backends;
const { shardFromTimestamp } = require('../../../../libV2/utils');
const schema = require('../../../../libV2/cache/schema');

const { generateFakeEvents } = require('../../../utils/v2Data');

const startTime = new Date().getTime();
const endTime = startTime + 30000; // Add 30 seconds;
const testValues = generateFakeEvents(startTime, endTime, 50);

describe('Test cache memory backend', () => {
    let mem;
    beforeEach(() => {
        mem = new MemoryCache();
    });

    it('should create a new memory backend instance', () => {
        assert.equal(mem instanceof MemoryCache, true);
    });

    testValues.map(event =>
        it('should set a key', async () => {
            const key = schema.getUtapiMetricKey('test', event);
            const res = await mem.setKey(key, event);
            assert.strictEqual(res, true);
            const db = mem._data;
            const expectedRes = {};
            expectedRes[key] = event;
            assert.deepStrictEqual(db, expectedRes);
        }));

    testValues.map(event =>
        it("should get a key's value", async () => {
            const key = schema.getUtapiMetricKey('test', event);
            const res = await mem.setKey(key, event);
            assert.strictEqual(res, true);
            const data = await mem.getKey(key);
            assert.deepStrictEqual(data, event);
        }));

    testValues.map(event =>
        it('should add a key to a shard', async () => {
            const shard = shardFromTimestamp(event.timestamp);
            const res = await mem.addToShard(shard, event);
            assert.strictEqual(res, true);
            const db = mem._shards;
            const expectedRes = {};
            expectedRes[shard] = [schema.getUtapiMetricKey('utapi', event)];
            assert.deepStrictEqual(db, expectedRes);
        }));

    it('should fetch the keys in a shard', async () => {
        const shard = shardFromTimestamp(new Date().getTime());
        await Promise.all(testValues.map(event => mem.addToShard(shard, event)));
        const keys = await mem.getKeysInShard(shard);
        const db = mem._shards;
        assert.deepStrictEqual(keys, db[shard]);
        assert.deepStrictEqual(
            keys,
            testValues.map(e => schema.getUtapiMetricKey('utapi', e)),
        );
    });

    it('should delete a shard and its keys', async () => {
        const shard = shardFromTimestamp(new Date().getTime());
        await Promise.all(testValues.map(event => mem.addToShard(shard, event)));
        const res = await mem.deleteShardAndKeys(shard);
        assert.strictEqual(res, true);
        const shards = mem._shards;
        const db = mem._data;
        assert.deepStrictEqual(undefined, shards[shard]);
        assert.deepStrictEqual(db, {});
    });

    it('should get all shards', async () => {
        await Promise.all(
            testValues.map(event => {
                const shard = shardFromTimestamp(event.timestamp);
                return mem.addToShard(shard, event.uuid);
            }),
        );
        const res = await mem.getShards();
        const expected = testValues.reduce(
            (shards, event) =>
                shards.add(`${shardFromTimestamp(event.timestamp)}`),
            new Set(),
        );
        assert.deepStrictEqual(res, Array.from(expected.values()));
    });

    describe('Test shardExists', () => {
        it('should return false if the shard does not exists', async () => {
            const shard = shardFromTimestamp(new Date().getTime() + 10000);
            const res = await mem.shardExists(shard);
            assert.strictEqual(res, false);
        });

        it('should return true if the shard exists', async () => {
            const shard = shardFromTimestamp(new Date().getTime());
            await mem.addToShard(shard, testValues[0]);
            const res = await mem.shardExists(shard);
            assert(res, true);
        });
    });

    it('should update the account size counter', async () => {
        await Promise.all(testValues.map(event => mem.updateCounters(event)));
        const expectedKey = schema.getAccountSizeCounterKey('utapi', testValues[0].account);
        const expectedValue = testValues.reduce((prev, event) => prev + (event.sizeDelta || 0), 0);
        assert.deepStrictEqual(mem._data, { [expectedKey]: expectedValue });
    });

    it('should update the account size counter base', async () => {
        await mem.updateAccountCounterBase('imanaccount', 1);
        const baseKey = schema.getAccountSizeCounterBaseKey('utapi', 'imanaccount');
        const counterKey = schema.getAccountSizeCounterKey('utapi', 'imanaccount');
        assert.deepStrictEqual(mem._data, { [baseKey]: 1, [counterKey]: 0 });
    });

    it('should fetch the account size counter  and base', async () => {
        const { account } = testValues[0];
        await mem.updateAccountCounterBase(account, 1);
        await Promise.all(testValues.map(event => mem.updateCounters(event)));
        const counterValue = testValues.reduce((prev, event) => prev + (event.sizeDelta || 0), 0);
        const res = await mem.fetchAccountSizeCounter(account);
        assert.deepStrictEqual(res, [counterValue, 1]);
    });
});
