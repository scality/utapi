const assert = require('assert');
const sinon = require('sinon');

const { InterpolatedClock } = require('../../../../libV2/utils');


describe('Test InterpolatedClock', () => {
    let fakeClock;
    let iClock;

    beforeEach(() => {
        fakeClock = sinon.useFakeTimers();
        iClock = new InterpolatedClock();
    });

    afterEach(() => {
        fakeClock.restore();
    });

    it('should get the current timestamp', () => {
        const ts = iClock.getTs();
        assert(Number.isInteger(ts));
        assert.strictEqual(ts, 0);
    });

    it('should interpolate microseconds if called too fast', () => {
        const initial = iClock.getTs();
        const second = iClock.getTs();
        const third = iClock.getTs();
        assert.strictEqual(second - initial, 1);
        assert.strictEqual(third - initial, 2);
        assert.strictEqual(third - second, 1);
    });

    it('should not interpolate if last call >= 1ms ago', () => {
        const initial = iClock.getTs();
        fakeClock.tick(1);
        const second = iClock.getTs();
        assert.strictEqual(second - initial, 1000000);
    });

    it('should not increment the provided timestamp if not conflicted', () => {
        const initial = 1000;
        const second = iClock.getTs(initial);
        assert.strictEqual(second, initial * 1000000);
    });

    it('should increment the provided timestamp if conflicted', () => {
        const initial = 1000;
        iClock.getTs(initial);
        const second = iClock.getTs(initial);
        assert.strictEqual(second, initial * 1000000 + 1);
    });
});
