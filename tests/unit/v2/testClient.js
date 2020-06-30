const assert = require('assert');
const sinon = require('sinon');
const { generateFakeEvents } = require('../../utils/v2Data');

const UtapiClient = require('../../../libV2/client');

const events = generateFakeEvents(1, 50, 50);
const sortEvent = (a, b) => (a.uuid > b.uuid ? 1 : -1);

// eslint-disable-next-line func-names
describe('Test UtapiClient', function () {
    this.timeout(10000);
    let client;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        client = new UtapiClient({
            drainDelay: 10,
        });
    });

    afterEach(() => {
        sandbox.restore();
        client = null;
    });

    it('should push a metric', done => {
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').resolves();
        client.pushMetric(events[0], err => {
            assert.ifError(err);
            done();
        });
    });

    it('should add a metric to the retry cache if an error occurs during pushing', done => {
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        const spy = sandbox.spy(client, '_addToRetryCache');
        client.pushMetric(events[0], err => {
            assert.strictEqual(err, null);
            assert(spy.calledWith(events[0]));
            assert.strictEqual(client._drainTimer, undefined);
            assert.strictEqual(client._numCachedMetrics, 1);
            done();
        });
    });

    it('should emit recovery log line if an error occurs when adding to memdown', done => {
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        sandbox.stub(client._retryCache, 'put').rejects();
        const spy = sandbox.spy(client, '_emitMetricLogLine');
        const expects = [
            events[0],
            { reason: 'error' },
        ];
        client.pushMetric(events[0], () => {
            assert(spy.calledWith(...expects));
            assert.strictEqual(client._drainTimer, null);
            assert.strictEqual(client._numCachedMetrics, 0);
            done();
        });
    });

    it('should emit recovery log line if at the max cached values', done => {
        client._numCachedMetrics = client._maxCachedMetrics;
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        const spy = sandbox.spy(client, '_emitMetricLogLine');
        const expects = [
            events[0],
            { reason: 'overflow' },
        ];
        client.pushMetric(events[0], () => {
            assert(spy.calledWith(...expects));
            assert.strictEqual(client._drainTimer, null);
            assert.strictEqual(client._numCachedMetrics, client._maxCachedMetrics);
            done();
        });
    });

    it('should schedule and attempt a drain', done => {
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        sandbox.stub(UtapiClient.prototype, '_drainRetryCachePreflight').resolves(true);
        const orig = UtapiClient.prototype._scheduleDrain;
        sandbox.stub(UtapiClient.prototype, '_scheduleDrain')
            .onFirstCall()
            .callsFake(orig.bind(client));
        const stub = sandbox.stub(UtapiClient.prototype, '_attemptDrain').resolves().callsFake(() => {
            stub.restore();
            done();
        });
        client.pushMetric(events[0]);
    });

    it('should begin a drain if preflight succeeds', done => {
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        sandbox.stub(UtapiClient.prototype, '_drainRetryCachePreflight').resolves(true);
        sandbox.stub(UtapiClient.prototype, '_drainRetryCache').resolves().callsFake(done);
        client.pushMetric(events[0]);
    });

    it('should reschedule a drain if all keys are not ingested', done => {
        sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        sandbox.stub(UtapiClient.prototype, '_drainRetryCachePreflight').resolves(true);
        sandbox.stub(UtapiClient.prototype, '_drainRetryCache').rejects();
        const orig = UtapiClient.prototype._scheduleDrain;
        sandbox.stub(UtapiClient.prototype, '_scheduleDrain')
            .onFirstCall()
            .callsFake(orig.bind(client))
            .resolves()
            .onSecondCall()
            .callsFake(done);
        client.pushMetric(events[0]);
    });

    it('should drain all events from the cache', async () => {
        const pushStub = sandbox.stub(UtapiClient.prototype, '_pushToUtapi').rejects();
        sandbox.stub(UtapiClient.prototype, '_drainRetryCachePreflight').resolves(true);
        sandbox.stub(UtapiClient.prototype, '_scheduleDrain').resolves();

        await Promise.all(events.map(ev => client._pushMetric(ev)));
        await client._attemptDrain();

        assert.deepStrictEqual(
            pushStub.lastCall.firstArg.sort(sortEvent),
            events.sort(sortEvent),
        );
    });

    it('should disable draining', async () => {
        client = new UtapiClient({
            drainDelay: 5000,
        });

        await client._disableDrain();
        assert.strictEqual(client._drainCanSchedule, false);
        assert.strictEqual(client._drainTimer, null);
        return new Promise((resolve, reject) => {
            sandbox.stub(UtapiClient.prototype, '_attemptDrain').callsFake(reject);
            setTimeout(resolve, 6000);
        });
    });
});

