const assert = require('assert');
const http = require('http');
const needle = require('needle');

const { UtapiServer } = require('../../../../libV2/server');
const { spec } = require('../../../../libV2/server/spec');

// validation errors are not utapi errors, so their details are masked outside of development mode
const invalidRequest = {
    code: 'InternalError',
    message: 'Internal Error',
};

describe('Test UtapiServer routing and request validation', () => {
    let server;
    let baseUrl;

    before(async () => {
        const app = await UtapiServer._createApp(spec);
        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(done => server.close(done));

    const json = { json: true };

    it('should route a request to its operation handler', async () => {
        const res = await needle('get', `${baseUrl}/_/healthcheck`);
        assert.strictEqual(res.statusCode, 200);
    });

    it('should serve prometheus metrics as plain text', async () => {
        const res = await needle('get', `${baseUrl}/_/metrics`);
        assert.strictEqual(res.statusCode, 200);
        assert.match(res.headers['content-type'], /^text\/plain/);
    });

    it('should serve the openapi spec', async () => {
        const res = await needle('get', `${baseUrl}/openapi.json`);
        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body, JSON.parse(JSON.stringify(spec)));
    });

    it('should return 404 for an undocumented route', async () => {
        const res = await needle('get', `${baseUrl}/v2/nope`);
        assert.strictEqual(res.statusCode, 404);
    });

    it('should return 404 for an undocumented method', async () => {
        const res = await needle('delete', `${baseUrl}/_/healthcheck`);
        assert.strictEqual(res.statusCode, 404);
    });

    [
        ['an invalid path parameter', 'get', '/v2/storage/nope/foo', null, {}],
        ['an ingest body of the wrong type', 'post', '/v2/ingest', { foo: 'bar' }, json],
        ['an ingest body with invalid fields', 'post', '/v2/ingest', [{ timestamp: 'now' }], json],
        ['a missing ingest body', 'post', '/v2/ingest', null, {}],
        ['a missing Action', 'post', '/buckets', { timeRange: [0, 1], buckets: ['foo'] }, json],
        ['an invalid Action', 'post', '/buckets?Action=Nope', { timeRange: [0, 1], buckets: ['foo'] }, json],
        ['an invalid level', 'post', '/nope?Action=ListMetrics', { timeRange: [0, 1] }, json],
        ['a body missing timeRange', 'post', '/buckets?Action=ListMetrics', { buckets: ['foo'] }, json],
        ['a timeRange of the wrong type', 'post', '/buckets?Action=ListMetrics', { timeRange: ['a'] }, json],
        ['an empty body', 'post', '/buckets?Action=ListMetrics', {}, json],
        ['a non-json body', 'post', '/buckets?Action=ListMetrics', 'timeRange=1', {}],
    ].forEach(([desc, method, url, body, opts]) => {
        it(`should reject a request with ${desc}`, async () => {
            const res = await needle(method, `${baseUrl}${url}`, body, opts);
            assert.strictEqual(res.statusCode, 400);
            assert.deepStrictEqual(res.body, invalidRequest);
        });
    });

    it('should pass path parameters and body to the operation', async () => {
        // the auth middleware reads the resources from body[level], with level taken from the path
        const res = await needle(
            'post',
            `${baseUrl}/buckets?Action=ListMetrics`,
            { timeRange: [0, 1], buckets: [] },
            { json: true, headers: { authorization: 'AWS4-HMAC-SHA256 Credential=x' } },
        );
        assert.strictEqual(res.statusCode, 400);
        assert.deepStrictEqual(res.body, {
            code: 'InvalidRequest',
            message: 'You must specify at least one resource',
        });
    });

    it('should accept unknown query parameters and reach the operation', async () => {
        const res = await needle(
            'post',
            `${baseUrl}/buckets?Action=ListMetrics&Version=20160815`,
            { timeRange: [0, 1], buckets: ['foo'] },
            json,
        );
        // the request passed validation and was rejected by the auth middleware
        assert.strictEqual(res.statusCode, 400);
        assert.deepStrictEqual(res.body, {
            code: 'InvalidRequest',
            message: 'Must use Auth V4 for this request.',
        });
    });
});
