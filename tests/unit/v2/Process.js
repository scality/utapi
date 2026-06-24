const assert = require('assert');
const sinon = require('sinon');
const Process = require('../../../libV2/process');

describe('Test Process cleanup', () => {
    let savedUncaught;

    beforeEach(() => {
        // join() removes every uncaughtException listener, including the test
        // runner's; snapshot them so they can be restored afterwards.
        savedUncaught = process.listeners('uncaughtException');
    });

    afterEach(() => {
        sinon.restore();
        process.removeAllListeners('uncaughtException');
        savedUncaught.forEach(listener => process.on('uncaughtException', listener));
    });

    it('join removes the uncaughtException listener even when _join fails', async () => {
        const proc = new Process();
        sinon.stub(proc, '_join').rejects(new Error('Connection is closed'));
        process.on('uncaughtException', () => {});

        await assert.rejects(() => proc.join(), /Connection is closed/);
        assert.strictEqual(process.listeners('uncaughtException').length, 0);
    });

    it('uncaughtException handler cleans up once and exits when cleanup fails', async () => {
        const proc = new Process();
        const joinStub = sinon.stub(proc, '_join').rejects(new Error('Connection is closed'));
        const exitStub = sinon.stub(process, 'exit');

        const before = new Set(process.listeners('uncaughtException'));
        await proc.setup();
        const handler = process.listeners('uncaughtException')
            .find(listener => !before.has(listener));
        assert(handler, 'setup should install an uncaughtException handler');

        await handler(new Error('boom'));
        await handler(new Error('boom again'));

        assert.strictEqual(joinStub.callCount, 1, 'cleanup should run only once');
        assert.ok(exitStub.calledWith(1), 'process should exit with a failure code');
    });
});
