const assert = require('assert');
const { RequestContext } = require('../../../../libV2/models');

const { templateRequest } = require('../../../utils/v2Data');

const templateExpected = opts => ({
    host: 'example.com',
    protocol: 'http',
    url: 'http://example.com/hello/world',
    operationId: 'healthcheck',
    tag: 'internal',
    encrypted: false,
    ...(opts || {}),
});


const validTestCases = [
    {
        request: templateRequest({
            connection: {
                encrypted: true,
            },
        }),
        expected: {
            protocol: 'https',
            url: 'https://example.com/hello/world',
            encrypted: true,
        },
    },
    {
        request: templateRequest({
            headers: {
                'host': 'example.com',
                'x-forwarded-proto': 'https',
            },
        }),
        expected: {
            protocol: 'https',
            url: 'https://example.com/hello/world',
            encrypted: true,
        },
    },
    {
        request: templateRequest({
            headers: {
                'host': 'example.com',
                'x-forwarded-proto': 'http',
            },
            connection: {
                encrypted: true,
            },
        }),
        expected: {
            encrypted: false,
        },
    },
    {
        request: templateRequest({
            headers: {
                'host': 'example.com',
                'x-forwarded-proto': 'https',
            },

        }),
        expected: {
            protocol: 'https',
            url: 'https://example.com/hello/world',
            encrypted: true,
        },
    },
];

const invalidTestCases = [
    {
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
    describe('Test valid cases', () => {
        validTestCases.forEach(testCase =>
            it('should create a RequestContext', () => {
                const expected = templateExpected({
                    request: testCase.request,
                    logger: testCase.request.logger,
                    results: testCase.request.results,
                    ...(testCase.expected || {}),
                });

                const ctx = new RequestContext(testCase.request);
                assert.deepStrictEqual(ctx.getValue(), expected);
            }));
    });

    describe('Test invalid cases', () => {
        invalidTestCases.forEach(testCase =>
            it('should fail to create a RequestContext', () => {
                assert.throws(() => new RequestContext(testCase.request));
            }));
    });
});
