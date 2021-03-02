const assert = require('assert');
const uuid = require('uuid');

const { CacheClient, backends: cacheBackends } = require('../../../../libV2/cache');
const { Warp10Client } = require('../../../../libV2/warp10');
const { convertTimestamp, shardFromTimestamp, now } = require('../../../../libV2/utils');
const { IngestShard } = require('../../../../libV2/tasks');
const config = require('../../../../libV2/config');
const { eventFieldsToWarp10 } = require('../../../../libV2/constants');

const { generateFakeEvents, fetchRecords } = require('../../../utils/v2Data');

const _now = Math.floor(new Date().getTime() / 1000);
const getTs = delta => convertTimestamp(_now + delta);

const getClient = prefix => new CacheClient({
    cacheBackend: new cacheBackends.RedisCache(
        config.cache,
        prefix,
    ),
    counterBackend: new cacheBackends.MemoryCache(),
});

function eventToWarp10(event) {
    return Object.entries(event.getValue())
        .filter(([key]) => eventFieldsToWarp10[key])
        .reduce((e, [k, v]) => {
            e[eventFieldsToWarp10[k]] = v;
            return e;
        }, {});
}

function assertResults(events, series) {
    assert.strictEqual(series.length, 1);
    const expected = events
        .reduce((prev, event) => {
            prev[event.uuid] = eventToWarp10(event);
            return prev;
        }, {});

    series[0].values.forEach(v => {
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

        warp10 = new Warp10Client({ nodeId: prefix });
        ingestTask = new IngestShard({ warp10: [warp10] });
        ingestTask._cache._cacheBackend._prefix = prefix;
        ingestTask._program = { lag: 0 };
        await ingestTask._cache.connect();
    });

    this.afterEach(async () => {
        await cacheClient.disconnect();
        await ingestTask._cache.disconnect();
    });

    it('should ingest metrics from a single shard', async () => {
        const start = shardFromTimestamp(getTs(-120));
        const stop = start + 9000000;
        const events = generateFakeEvents(start, stop, 100);
        ingestTask._stripEventUUID = false;

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();

        const series = await fetchRecords(
            warp10,
            'utapi.event',
            { node: prefix },
            { end: stop, count: 100 },
            '@utapi/decodeEvent',
        );
        assertResults(events, series);
    });

    it('should ingest metrics for multiple shards', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const events = generateFakeEvents(start, stop, 100);
        ingestTask._stripEventUUID = false;

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();

        const series = await fetchRecords(
            warp10,
            'utapi.event',
            { node: prefix },
            { end: stop, count: 100 },
            '@utapi/decodeEvent',
        );

        assertResults(events, series);
    });

    it('should ingest old metrics as repair', async () => {
        const start = shardFromTimestamp(getTs(-720));
        const stop = start + 9000000;
        const events = generateFakeEvents(start, stop, 100);
        ingestTask._stripEventUUID = false;

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();

        const series = await fetchRecords(
            warp10,
            'utapi.repair.event',
            { node: prefix },
            { end: now(), count: 100 },
            '@utapi/decodeEvent',
        );
        assertResults(events, series);
    });

    it('should strip the event uuid during ingestion', async () => {
        const start = shardFromTimestamp(getTs(-120));
        const stop = start + 9000000;
        const events = generateFakeEvents(start, stop, 100);

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();

        const series = await fetchRecords(
            warp10,
            'utapi.event',
            { node: prefix },
            { end: stop, count: 100 },
            '@utapi/decodeEvent',
        );
        series[0].values.forEach(val => assert.strictEqual(val.id, undefined));
    });

    it('should increment microseconds for duplicate timestamps', async () => {
        const start = shardFromTimestamp(getTs(-120));
        const events = generateFakeEvents(start, start + 1, 2)
            .map(ev => { ev.timestamp = start; return ev; });

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();

        const results = await warp10.fetch({
            className: 'utapi.event', labels: { node: prefix }, start: start + 1, stop: -2,
        });

        const series = JSON.parse(results.result[0])[0];
        const timestamps = series.v.map(ev => ev[0]);
        assert.deepStrictEqual([
            start + 1,
            start,
        ], timestamps);
    });

    it('should not increment microseconds for different timestamps', async () => {
        const start = shardFromTimestamp(getTs(-120));
        const events = generateFakeEvents(start, start + 1, 2);

        events[1].timestamp = start + 5;

        await Promise.all(events.map(e => cacheClient.pushMetric(e)));
        await ingestTask.execute();

        const results = await warp10.fetch({
            className: 'utapi.event', labels: { node: prefix }, start: start + 10, stop: -2,
        });

        const series = JSON.parse(results.result[0])[0];
        const timestamps = series.v.map(ev => ev[0]);
        assert.deepStrictEqual([
            start + 5,
            start,
        ], timestamps);
    });
});

