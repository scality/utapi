const assert = require('assert');
const needle = require('needle');

const { generateFakeEvents } = require('../../../utils/v2Data');

function utapiRequest(events) {
    return needle(
        'post',
        'http://localhost:8100/v2/ingest',
        events,
    );
}

const events = generateFakeEvents(1, 50, 50);

describe('Test ingestMetric', () => {
    it('should ingest metrics', async () => {
        await utapiRequest(events);
    });

    it('should respond with Bad Request if metric data is invalid', async () => {
        const res = await utapiRequest([{ operationId: 'invalid' }]);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.statusMessage, 'Bad Request');
    });
});
