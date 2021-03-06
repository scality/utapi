const assert = require('assert');
const { makeUtapiGenericClientRequest } = require('../../utils/utils');
const Vault = require('../../utils/mock/Vault');

const MAX_RANGE_MS = (((1000 * 60) * 60) * 24) * 30; // One month.

describe('Request ranges', function test() {
    this.timeout((1000 * 60) * 2);
    const vault = new Vault();

    before(() => {
        vault.start();
    });

    after(() => {
        vault.end();
    });

    const tests = [
        {
            action: 'ListMetrics',
            type: 'accounts',
            resource: '1234567890',
            timeRange: [
                0,
                ((MAX_RANGE_MS / 60) - (1000 * 60) * 15) - 1,
            ],
            expected: {
                accountId: '1234567890',
            },
        },
        {
            action: 'ListMetrics',
            type: 'buckets',
            resource: 'my-bucket',
            timeRange: [
                0,
                ((MAX_RANGE_MS / 60) - (1000 * 60) * 15) - 1,
            ],
            expected: {
                bucketName: 'my-bucket',
            },
        },
        {
            action: 'ListMetrics',
            type: 'buckets',
            resource: 'my-bucket',
            timeRange: [
                0,
                MAX_RANGE_MS - 1,
            ],
            expected: {
                bucketName: 'my-bucket',
            },
        },
        {
            action: 'ListMetrics',
            type: 'buckets',
            resource: 'my-bucket',
            timeRange: [
                0,
                (MAX_RANGE_MS + (1000 * 60) * 15) - 1,
            ],
            expected: {
                bucketName: 'my-bucket',
            },
        },
        {
            action: 'ListMetrics',
            type: 'buckets',
            resource: 'my-bucket',
            timeRange: [
                0,
                (MAX_RANGE_MS * 12) - 1,
            ],
            expected: {
                bucketName: 'my-bucket',
            },
        },
        {
            action: 'ListRecentMetrics',
            type: 'buckets',
            resource: 'my-bucket',
            expected: {
                bucketName: 'my-bucket',
            },
        },
        {
            action: 'ListRecentMetrics',
            type: 'accounts',
            resource: '1234567890',
            expected: {
                accountId: '1234567890',
            },
        },
    ];

    tests.forEach(test => {
        const {
            timeRange, type, resource, expected, action,
        } = test;
        const msg = timeRange
            ? `should handle a request range of ${timeRange[1] - timeRange[0]}ms`
            : 'should handle a ListRecentMetrics request';
        it(msg, done => {
            const headers = {
                method: 'POST',
                path: `/${type}?Action=${action}`,
            };
            const body = {
                timeRange,
                [type]: [resource],
            };
            makeUtapiGenericClientRequest(headers, body, (err, response) => {
                if (err) {
                    return done(err);
                }
                const data = JSON.parse(response);
                if (data.code) {
                    return done(new Error(data.message));
                }

                if (timeRange) {
                    assert.deepStrictEqual(timeRange, data[0].timeRange);
                }

                Object.entries(expected).forEach(([k, v]) => {
                    assert.strictEqual(data[0][k], v);
                });
                return done();
            });
        });
    });
});
