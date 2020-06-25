const assert = require('assert');
const { RequestContext } = require('../../../../libV2/models');

const { templateRequest } = require('../../../utils/v2Data');

const templateExpected = opts => ({
    host: 'example.com',
    protocol: 'http',
    url: 'http://example.com/hello/world',
    operationId: 'healthcheck',
    tag: 'internal',
    ...(opts || {}),
});


const testCases = [
    {
        valid: true,
        request: templateRequest(),
    },
    {
        valid: true,
        request: templateRequest({
            connection: {
                encrypted: true,
            },
        }),
        expected: {
            protocol: 'https',
            url: 'https://example.com/hello/world',
        },
    },
    {
        valid: true,
        request: templateRequest({
            headers: {
                'host': 'example.com',
                'x-forwarded-proto': 'https',
            },
        }),
        expected: {
            protocol: 'https',
            url: 'https://example.com/hello/world',
        },
    },
    {
        valid: true,
        request: templateRequest({
            headers: {
                'host': 'example.com',
                'x-forwarded-proto': 'http',
            },
            connection: {
                encrypted: true,
            },
        }),
    },
    {
        valid: true,
        request: templateRequest({
            headers: {
                'host': 'example.com',
                'x-forwarded-proto': 'https',
            },

        }),
        expected: {
            protocol: 'https',
            url: 'https://example.com/hello/world',
        },
    },
    {
        valid: false,
        request: templateRequest({
            swagger: {
                operation: {
                    'x-router-controller': 'invalid',
                    'operationId': 'healthcheck',
                },
            },
        }),
    },
    {
        valid: false,
        request: templateRequest({
            swagger: {
                operation: {
                    'x-router-controller': 'internal',
                    'operationId': 'invalid',
                },
            },
        }),
    },
];


describe('Test RequestContext', () => {
    testCases.forEach(testCase => {
        let valid = true;
        let ctx;
        const expected = templateExpected({
            request: testCase.request,
            logger: testCase.request.logger,
            results: testCase.request.results,
            ...(testCase.expected || {}),
        });

        try {
            ctx = new RequestContext(testCase.request);
        } catch (err) {
            if (testCase.valid) {
                // rethrow errors we don't expect
                throw err;
            }
            valid = false;
        }

        assert.strictEqual(valid, testCase.valid);

        if (testCase.valid) {
            assert.deepStrictEqual(ctx.getValue(), expected);
        }
    });
});
