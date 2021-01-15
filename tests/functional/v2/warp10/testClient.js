const uuid = require('uuid');
const assert = require('assert');

const { Warp10Client } = require('../../../../libV2/warp10');
const { generateFakeEvents } = require('../../../utils/v2Data');

const warp10 = new Warp10Client();

const startTime = new Date().getTime();
const endTime = startTime + 30000; // Add 30 seconds;
const testValues = generateFakeEvents(startTime, endTime, 1);

const testWarpscript = "CLEAR [ 'OK' ]";

describe('Test Warp Client', () => {
    let className;
    beforeEach(() => {
        className = `utapi.test.${uuid.v4().replace(/-/g, '')}`;
    });

    it('should ingest records', async () => {
        const res = await warp10.ingest({ className }, testValues);
        assert.strictEqual(res, testValues.length);
    });

    // TODO after the macro encoder is written this will need to be updated
    it('should fetch records', async () => {
        await warp10.ingest({ className }, testValues);
        const res = await warp10.fetch({ className, start: `${new Date().getTime()}000`, stop: -100 });
        const parsed = JSON.parse(res.result[0])[0];
        assert.strictEqual(parsed.c, className);
        assert.deepStrictEqual(
            parsed.v.map(v => v[0]),
            testValues.map(v => v.timestamp),
        );
    });

    it('should execute some warpscript', async () => {
        const res = await warp10.exec({ script: testWarpscript, params: { greeting: 'hello' } });
        assert.deepStrictEqual(res.result[0], ['OK']);
    });

    it('should delete the specified time range', async () => {
        const ev = generateFakeEvents(startTime, endTime, 100);
        const count = await warp10.ingest({ className }, ev);
        let fetchResp = await warp10.fetch({ className, start: endTime, stop: startTime });
        assert.strictEqual(JSON.parse(fetchResp.result[0]).length, 1);
        assert.strictEqual(JSON.parse(fetchResp.result[0])[0].v.length, count);
        await warp10.delete({ className, start: startTime, end: endTime });
        fetchResp = await warp10.fetch({ className, start: endTime, stop: startTime });
        assert.strictEqual(JSON.parse(fetchResp.result[0]).length, 0);
    });
});
