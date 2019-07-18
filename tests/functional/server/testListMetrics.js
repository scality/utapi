const assert = require('assert');
const { makeUtapiClientRequest } = require('../../utils/utils');
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
            start: 0,
            end: ((MAX_RANGE_MS / 60) - (1000 * 60) * 15) - 1,
        },
        {
            start: 0,
            end: MAX_RANGE_MS - 1,
        },
        {
            start: 0,
            end: (MAX_RANGE_MS + (1000 * 60) * 15) - 1,
        },
        {
            start: 0,
            end: (MAX_RANGE_MS * 12) - 1,
        },
    ];

    tests.forEach(test => {
        const { start, end } = test;
        it(`should handle a request range of ${end - start}ms`, done => {
            const params = {
                timeRange: [start, end],
                resource: {
                    type: 'buckets',
                    buckets: ['my-bucket'],
                },
            };
            makeUtapiClientRequest(params, (err, response) => {
                if (err) {
                    return done(err);
                }
                const data = JSON.parse(response);
                if (data.code) {
                    return done(new Error(data.message));
                }
                const { timeRange } = data[0];
                assert.deepStrictEqual(timeRange, [start, end]);
                return done();
            });
        });
    });
});
