const assert = require('assert');
const sinon = require('sinon');
const ingestMetric = require('../../../../../libV2/server/API/metrics/ingestMetric');
const { client: cacheClient } = require('../../../../../libV2/cache');
const { convertTimestamp } = require('../../../../../libV2/utils');
const { UtapiMetric } = require('../../../../../libV2/models');
const { generateFakeEvents, templateContext } = require('../../../../utils/v2Data');

const events = generateFakeEvents(1, 50, 50);

describe('Test ingestMetric', () => {
    let ctx;
    beforeEach(() => {
        ctx = templateContext();
    });

    afterEach(() => sinon.restore());

    it('should ingest metrics', async () => {
        const spy = sinon.spy(cacheClient, 'pushMetric');
        await ingestMetric(ctx, { body: events.map(ev => ev.getValue()) });
        assert.strictEqual(ctx.results.statusCode, 200);
        events.forEach(ev => {
            assert(spy.calledWith(
                new UtapiMetric({
                    ...ev.getValue(),
                    timestamp: convertTimestamp(ev.timestamp),
                }),
            ));
        });
    });

    it('should throw InvalidRequest if metric data is invalid',
        () => assert.rejects(
            ingestMetric(ctx, { body: [{ operationId: 'invalid' }] }),
            err => err.code === 400 && err.InvalidRequest,
        ));

    it('should throw ServiceUnavailable if the cache client encounters an error', () => {
        sinon.stub(cacheClient, 'pushMetric').rejects();
        return assert.rejects(
            ingestMetric(ctx, { body: events.map(ev => ev.getValue()) }),
            err => err.code === 503 && err.ServiceUnavailable,
        );
    });

    it('should translate putDeleteMarkerObject to deleteObject', async () => {
        const spy = sinon.spy(cacheClient, 'pushMetric');
        const metric = new UtapiMetric({
            operationId: 'putDeleteMarkerObject',
        });
        await ingestMetric(ctx, { body: [metric.getValue()] });
        assert.strictEqual(ctx.results.statusCode, 200);
        assert(spy.calledWith(
            new UtapiMetric({
                operationId: 'deleteObject',
                timestamp: convertTimestamp(metric.timestamp),
            }),
        ));
    });
});
