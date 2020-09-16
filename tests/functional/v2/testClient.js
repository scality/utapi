const assert = require('assert');
const async = require('async');
const sinon = require('sinon');
const uuid = require('uuid');

const UtapiClient = require('../../../libV2/client');
const config = require('../../../libV2/config');
const { CacheClient, backends: cacheBackends } = require('../../../libV2/cache');
const { IngestShard } = require('../../../libV2/tasks');
const { generateCustomEvents } = require('../../utils/v2Data');

const getClient = prefix => new CacheClient({
    cacheBackend: new cacheBackends.RedisCache(
        config.cache,
        prefix,
    ),
    counterBackend: new cacheBackends.RedisCache(
        config.cache,
        prefix,
    ),
});

const { events, totals } = generateCustomEvents(1, 50, 50, {
    [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] },
});

// eslint-disable-next-line func-names
describe('Test UtapiClient', function () {
    this.timeout(10000);
    let client;
    let sandbox;

    let events;
    let total;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        client = new UtapiClient({
            drainDelay: 5000,
        });
        const { events: _events, totals: _total } = generateCustomEvents(1, 50, 50, {
            [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] },
        });

        events = _events;
        totals = _totals;
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

    describe.only('Test getStorage', () => {
        let prefix;
        let cacheClient;
        let ingestTask;

        beforeEach(async () => {
            prefix = uuid.v4();
            cacheClient = getClient(prefix);
            await cacheClient.connect();

            ingestTask = new IngestShard();
            ingestTask._cache._cacheBackend._prefix = prefix;
            console.log(ingestTask._cache._cacheBackend)
            ingestTask._program = { lag: 0 };
            await ingestTask._cache.connect();
            console.log(ingestTask._cache._cacheBackend)
        });

        it('should get the current value from warp10 if cache is empty', async () => {
            await Promise.all(events.map(ev => cacheClient.pushMetric(ev)));
            await ingestTask.execute();

            await async.eachOf(totals.accounts, async (total, acc) => {
                const resp = await client.getStorage('accounts', acc);
                console.log(total);
                console.log(resp);
            });
        });
    });
});

