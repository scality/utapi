const assert = require('assert');
const { RequestContext } = require('../../../../../libV2/models');
const { templateRequest } = require('../../../../utils/v2Data');
const prometheusMetrics = require('../../../../../libV2/server/API/internal/prometheusMetrics');

describe('Test prometheusMetrics', () => {
    const overrides = {
        swagger: {
            operation: {
                'x-router-controller': 'internal',
                'operationId': 'prometheusMetrics',
            },
            params: {},
        },
    };
    const ctx = new RequestContext(templateRequest(overrides));

    before(async () => {
        await prometheusMetrics(ctx);
    });

    it('should set statusCode to 200', () => {
        assert.strictEqual(res.statusCode, 200);
    });

    it('should have a response body', () => {
        assert.typeOf(ctx.results.body, 'string');
    });

    it('should contain metrics', () => {
        const lines = ctx.results.body.split('\n');
        const first = lines[0];
        assert(first.startsWith('# HELP'));
    });
});
