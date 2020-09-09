const assert = require('assert');
const {
    CacheClient,
    backends: cacheBackends,
} = require('../../../../libV2/cache');
const { shardFromTimestamp } = require('../../../../libV2/utils');
const schema = require('../../../../libV2/cache/schema');

const { generateFakeEvents } = require('../../../utils/v2Data');

const startTime = new Date().getTime();
const endTime = startTime + 30000; // Add 30 seconds;
const testValues = generateFakeEvents(startTime, endTime, 50);

const sortEvent = (a, b) => (a.uuid > b.uuid ? 1 : -1);

describe('Test high level cache client', () => {
    let client;
    beforeEach(() => {
        client = new CacheClient({
            cacheBackend: new cacheBackends.MemoryCache(),
            counterBackend: new cacheBackends.MemoryCache(),
        });
    });

    it('should push a metric', async () => {
        const res = await Promise.all(testValues.map(event => client.pushMetric(event)));
        assert(res.every(v => v));
        const keys = testValues.map(e => schema.getUtapiMetricKey('utapi', e));
        const events = await Promise.all(keys.map(k => client._cacheBackend.getKey(k)));
        assert.deepStrictEqual(events, testValues);
    });

    it('should get metrics for a shard', async () => {
        const expectedShards = testValues.reduce((es, event) => {
            const shard = shardFromTimestamp(event.timestamp);
            if (es[shard]) {
                es[shard].push(event);
            } else {
                // eslint-disable-next-line no-param-reassign
                es[shard] = [event];
            }
            return es;
        }, {});
        await Promise.all(testValues.map(event => client.pushMetric(event)));
        const res = await Promise.all(
            Object.keys(expectedShards).map(async k => [k, await client.getMetricsForShard(k)]),
        );
        res.forEach(([shard, events]) =>
            assert.deepStrictEqual(
                events.sort(sortEvent),
                expectedShards[shard].sort(sortEvent),
            ));
    });

    it('should delete a shard and its data', async () => {
        const expectedShards = testValues.reduce((es, event) => {
            const shard = shardFromTimestamp(event.timestamp);
            if (es[shard]) {
                es[shard].push(event);
            } else {
                // eslint-disable-next-line no-param-reassign
                es[shard] = [event];
            }
            return es;
        }, {});
        const shardKeys = Object.keys(expectedShards);
        await Promise.all(testValues.map(event => client.pushMetric(event)));
        await Promise.all(shardKeys.map(k => client.deleteShard(k)));
        const res = await Promise.all(shardKeys.map(k => client.shardExists(k)));
        assert(res.every(v => !v));
    });

    it('should update the account size counter', async () => {
        const res = await Promise.all(testValues.map(event => client.pushMetric(event)));
        assert(res.every(v => v));
        const expectedValue = testValues.reduce((prev, event) => prev + (event.sizeDelta || 0), 0);
        const [counterValue] = await client.fetchAccountSizeCounter(testValues[0].account);
        assert.strictEqual(counterValue, expectedValue);
    });

    it('should update the account size counter base', async () => {
        await client.updateAccountCounterBase('imanaccount', 1);
        // eslint-disable-next-line no-unused-vars
        const [_, baseValue] = await client.fetchAccountSizeCounter('imanaccount', testValues[0].account);
        assert.strictEqual(baseValue, 1);
    });
});
