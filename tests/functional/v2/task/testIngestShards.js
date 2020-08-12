const assert = require('assert');
const uuid = require('uuid');

const { CacheClient, backends: cacheBackends } = require('../../../../libV2/cache');
const { Warp10Client } = require('../../../../libV2/warp10');
const { convertTimestamp, shardFromTimestamp } = require('../../../../libV2/utils');
const { IngestShard } = require('../../../../libV2/tasks');
const config = require('../../../../libV2/config');
const { eventFieldsToWarp10 } = require('../../../../libV2/constants');

const { generateFakeEvents, protobuf } = require('../../../utils/v2Data');

const _now = Math.floor(new Date().getTime() / 1000);
const getTs = delta => convertTimestamp(_now + delta);

const getClient = prefix => new CacheClient({
    backend: new cacheBackends.RedisCache(
        config.cache,
        prefix,
    ),
});

function eventToWarp10(event) {
    return Object.entries(event.getValue())
        .filter(([key]) => eventFieldsToWarp10[key])
        .reduce((e, [k, v]) => {
            e[eventFieldsToWarp10[k]] = v;
            return e;
        }, {});
}

function assertResults(events, results) {
    assert.strictEqual(results.result.length, 1);
    const series = JSON.parse(results.result[0]);
    assert.strictEqual(series.length, 1);
    const gts = series[0];
    const decoded = gts.v.map(v => protobuf.decode('Event', v[1], false));

    const expected = events
        .reduce((prev, event) => {
            prev[event.uuid] = eventToWarp10(event);
            return prev;
        }, {});


    decoded.forEach(v => {
        assert.deepStrictEqual(v, expected[v.id]);
    });
}

// eslint-disable-next-line func-names
describe('Test IngestShards', function () {
    this.timeout(10000);

    let prefix;
    let cacheClient;
    let warp10;
    let ingestTask;

    beforeEach(async () => {
        prefix = uuid.v4();
        cacheClient = getClient(prefix);
        await cacheClient.connect();

        ingestTask = new IngestShard({ warp10: { nodeId: prefix } });
        ingestTask._cache._backend._prefix = prefix;
        ingestTask._program = { lag: 0 };
        await ingestTask._cache.connect();

        warp10 = new Warp10Client({ nodeId: prefix });
    });

    this.afterEach(async () => {
        await cacheClient.disconnect();
        await ingestTask._cache.disconnect();
    });

    it('should ingest metrics from a single shard', async () => {
        const start = shardFromTimestamp(getTs(-120));
        const stop = start + 9000000;
        const events = generateFakeEvents(start, stop, 100);

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();
        const results = await warp10.fetch({
            className: 'utapi.event', labels: { node: prefix }, start: stop, stop: -100,
        });
        assertResults(events, results);
    });

    it('should ingest metrics for multiple shards', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const events = generateFakeEvents(start, stop, 100);

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();
        const results = await warp10.fetch({
            className: 'utapi.event', labels: { node: prefix }, start: stop, stop: -100,
        });
        assertResults(events, results);
    });

    it('should ingest old metrics as repair', async () => {
        const start = shardFromTimestamp(getTs(-720));
        const stop = start + 9000000;
        const events = generateFakeEvents(start, stop, 100);

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();
        const results = await warp10.fetch({
            className: 'utapi.repair.event', labels: { node: prefix }, start: new Date().getTime() * 1000, stop: -100,
        });
        assertResults(events, results);
    });
});

