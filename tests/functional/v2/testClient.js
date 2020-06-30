const assert = require('assert');
const sinon = require('sinon');

const { generateFakeEvents } = require('../../utils/v2Data');

const UtapiClient = require('../../../libV2/client');

const events = generateFakeEvents(1, 50, 50);

// Unskip after server side support is added
// eslint-disable-next-line func-names
describe.skip('Test UtapiClient', function () {
    this.timeout(10000);
    let client;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        client = new UtapiClient({
            drainDelay: 5000,
        });
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

