const assert = require('assert');
const needle = require('needle');


describe('Test healthcheck handler', () => {
    it('should return true', async () => {
        const res = await needle('get', 'http://127.0.0.1:8100/_/healthcheck');
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.statusMessage, 'OK');
    });
});

