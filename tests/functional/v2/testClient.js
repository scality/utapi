const assert = require('assert');
const async = require('async');
const sinon = require('sinon');
const uuid = require('uuid');

const UtapiClient = require('../../../libV2/client');
const { client: warp10 } = require('../../../libV2/warp10');
const config = require('../../../libV2/config');
const { CacheClient, backends: cacheBackends } = require('../../../libV2/cache');
const { IngestShard } = require('../../../libV2/tasks');
const { now } = require('../../../libV2/utils');
const { generateCustomEvents } = require('../../utils/v2Data');

const getClient = () => new CacheClient({
    cacheBackend: new cacheBackends.RedisCache(
        config.cache,
    ),
    counterBackend: new cacheBackends.RedisCache(
        config.cache,
    ),
});

// eslint-disable-next-line func-names
describe('Test UtapiClient', function () {
    this.timeout(10000);

    describe('pushMetric', () => {
        let client;
        let sandbox;

        let events;

        beforeEach(() => {
            sandbox = sinon.createSandbox();

            client = new UtapiClient({
                drainDelay: 5000,
            });

            const { events: _events } = generateCustomEvents(now() - (60 * 1000000), now() - (10 * 1000000), 50, {
                [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] },
            });
            // Hack because you can't unpack to previously declared variables,
            // and declaring inside the beforeEach wouldn't have the scope needed
            events = _events;
        });

        afterEach(() => {
            sandbox.restore();
            client = null;
        });

        it('should ingest metrics', async () => {
            const pushSpy = sandbox.spy(UtapiClient.prototype, '_pushToUtapi');
            const retrySpy = sandbox.spy(UtapiClient.prototype, '_addToRetryCache');
            await Promise.all(events.map(ev => client.pushMetric(ev)));
            assert.strictEqual(pushSpy.callCount, 50);
            assert.strictEqual(retrySpy.callCount, 0);
        });

        it('should retry failed metrics', async () => {
            const retrySpy = sandbox.spy(UtapiClient.prototype, '_addToRetryCache');
            const orig = UtapiClient.prototype._pushToUtapi;
            const pushStub = sandbox
                .stub(UtapiClient.prototype, '_pushToUtapi')
                .rejects()
                .onCall(51)
                .callsFake(orig.bind(client));

            await Promise.all(events.map(ev => client.pushMetric(ev)));
            return new Promise(resolve => {
                setTimeout(() => {
                    assert.strictEqual(pushStub.callCount, 51);
                    assert.strictEqual(retrySpy.callCount, 50);
                    resolve();
                }, 6000);
            });
        });
    });


    describe('getStorage', () => {
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
                now() - (60 * 1000000), now() - (10 * 1000000), 50, {
                    [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] },
                },
            );
            events = _events;
            totals = _totals;

            cacheClient = getClient();
            await cacheClient.connect();

            ingestTask = new IngestShard();
            ingestTask._program = { lag: 0 };
            await ingestTask._cache.connect();
        });

        it('should get the current storage for an account with a empty cache', async () => {
            await warp10.ingest({ className: 'utapi.event' }, events);

            await async.eachOf(totals.accounts, async (total, acc) => {
                const resp = await client.getStorage('accounts', acc);
                assert.strictEqual(resp.storageUtilized, total.bytes);
            });
        });

        it('should get the current storage for an account using the cache', async () => {
            await async.eachOf(totals.accounts, async (total, acc) => {
                cacheClient.updateAccountCounterBase(acc, total.bytes);
            });

            await async.eachOf(totals.accounts, async (total, acc) => {
                const resp = await client.getStorage('accounts', acc);
                assert.strictEqual(resp.storageUtilized, total.bytes);
            });
        });
    });
});

