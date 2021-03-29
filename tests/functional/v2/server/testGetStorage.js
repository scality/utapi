const assert = require('assert');
const async = require('async');
const uuid = require('uuid');

const UtapiClient = require('../../../../libV2/client');
const { Warp10Client } = require('../../../../libV2/warp10');
const config = require('../../../../libV2/config');
const { CacheClient, backends: cacheBackends } = require('../../../../libV2/cache');
const { IngestShard } = require('../../../../libV2/tasks');
const { now } = require('../../../../libV2/utils');
const { generateCustomEvents } = require('../../../utils/v2Data');
const { UtapiMetric } = require('../../../../libV2/models');

const getClient = () => new CacheClient({
    cacheBackend: new cacheBackends.RedisCache(
        config.cache,
    ),
    counterBackend: new cacheBackends.RedisCache(
        config.cache,
    ),
});

const warp10 = new Warp10Client();

// eslint-disable-next-line func-names
describe('Test getStorage handler', function () {
    this.timeout(120000);
    let client;

    let events;
    let totals;

    let cacheClient;
    let ingestTask;

    beforeEach(async () => {
        client = new UtapiClient({
            drainDelay: 5000,
        });

        const { events: _events, totals: _totals } = generateCustomEvents(
            now() - (120 * 1000000), now() - (30 * 1000000), 50, {
                [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] },
            },
        );
        events = _events;
        totals = _totals;

        cacheClient = getClient();
        await cacheClient.connect();

        ingestTask = new IngestShard(
            config.merge({
                warp10: {
                    hosts: [config.warp10.hosts[0]],
                },
            }),
        );
        ingestTask._program = { lag: 0 };
        await ingestTask.setup();
    });

    afterEach(async () => {
        await cacheClient._cacheBackend._redis._redis.flushall();
        await warp10.delete({
            className: '~.*',
            start: 0,
            end: now(),
        });
    });

    it('should get the current storage for an account with a empty cache', async () => {
        await warp10.ingest({ className: 'utapi.event' }, events);

        await async.eachOf(totals.accounts, async (total, acc) => {
            const resp = await client.getStorage('accounts', acc);
            assert.strictEqual(resp.storageUtilized, total.bytes);

            const [counterVal, baseVal] = await cacheClient.fetchAccountSizeCounter(acc);
            assert.strictEqual(counterVal, 0);
            assert.strictEqual(baseVal, total.bytes);
        });
    });

    it('should get the current storage for an account using the cache', async () => {
        const firstHalfTotal = events.slice(0, 24).reduce((prev, ev) => {
            if (prev[ev.account] === undefined) {
                prev[ev.account] = 0;
            }
            if (ev.sizeDelta !== undefined) {
                prev[ev.account] += ev.sizeDelta;
            }
            return prev;
        }, {});

        const secondHalfTotal = events.slice(24).reduce((prev, ev) => {
            if (ev.sizeDelta !== undefined) {
                if (prev[ev.account] === undefined) {
                    prev[ev.account] = 0;
                }
                prev[ev.account] += ev.sizeDelta;
            }
            return prev;
        }, {});

        // Ingest first 25 events
        await warp10.ingest({ className: 'utapi.event' }, events.slice(0, 24));

        // Fetch metric to populate cache
        await async.eachOf(firstHalfTotal, async (total, acc) => {
            const resp = await client.getStorage('accounts', acc);
            assert.strictEqual(resp.storageUtilized, firstHalfTotal[acc]);
            const [counterVal, baseVal] = await cacheClient.fetchAccountSizeCounter(acc);
            assert.strictEqual(counterVal, 0);
            assert.strictEqual(baseVal, firstHalfTotal[acc]);
        });

        // Push remaining events to increment counter in cache
        await async.each(events.slice(24), async ev => cacheClient.pushMetric(ev));

        await async.eachOf(totals.accounts, async (total, acc) => {
            const resp = await client.getStorage('accounts', acc);
            assert.strictEqual(resp.storageUtilized, total.bytes);
            const [counterVal, baseVal] = await cacheClient.fetchAccountSizeCounter(acc);
            assert.strictEqual(counterVal, secondHalfTotal[acc]);
            assert.strictEqual(baseVal, firstHalfTotal[acc]);
        });
    });

    it('should return a 0 instead of a negative value', async () => {
        const account = `imaaccount-${uuid.v4()}`;
        const event = new UtapiMetric({
            timestamp: now(),
            account,
            objectDelta: -1,
            sizeDelta: -1,
            incomingBytes: -1,
            outgoingBytes: -1,
            operationId: 'putObject',
        });

        await warp10.ingest({ className: 'utapi.event' }, [event]);

        const resp = await client.getStorage('accounts', account);
        assert.strictEqual(resp.storageUtilized, 0);
    });
});
