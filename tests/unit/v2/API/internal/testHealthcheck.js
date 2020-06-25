const assert = require('assert');
const { RequestContext } = require('../../../../../libV2/models');
const { templateRequest } = require('../../../../utils/v2Data');
const healthcheck = require('../../../../../libV2/server/API/internal/healthcheck');


describe('Test healthcheck', () => {
    it('should set statusCode to 200', async () => {
        const ctx = new RequestContext(templateRequest());
        await healthcheck(ctx);
        assert(ctx.results.statusCode === 200);
    });
});
