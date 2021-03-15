/* eslint-disable func-names */
const assert = require('assert');
const needle = require('needle');
const uuid = require('uuid');
const aws4 = require('aws4');

const { clients: warp10Clients } = require('../../../../libV2/warp10');
const { convertTimestamp, now } = require('../../../../libV2/utils');
const { operationToResponse } = require('../../../../libV2/constants');

const { generateCustomEvents } = require('../../../utils/v2Data');
const { UtapiMetric } = require('../../../../libV2/models');

const warp10 = warp10Clients[0];
const _now = Math.floor(new Date().getTime() / 1000);
const getTs = delta => convertTimestamp(_now + delta);

const metricResponseKeys = {
    buckets: 'bucketName',
    accounts: 'accountId',
    users: 'userId',
    service: 'serviceName',
};

const emptyOperationsResponse = Object.values(operationToResponse)
    .reduce((prev, key) => {
        prev[key] = 0;
        return prev;
    }, {});

async function listMetrics(level, resources, start, end, force403 = false) {
    const body = {
        [level]: resources,
    };

    if (end !== undefined) {
        body.timeRange = [start, end];
    } else {
        body.timeRange = [start];
    }

    const headers = {
        host: 'localhost',
        port: 8100,
        method: 'POST',
        service: 's3',
        path: `/${level}?Action=ListMetrics`,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const credentials = {
        accessKeyId: force403 ? 'invalidKey' : 'accessKey1',
        secretAccessKey: 'verySecretKey1',
    };

    const sig = aws4.sign(headers, credentials);

    return needle(
        'post',
        `http://localhost:8100/${level}?Action=ListMetrics`,

        body,
        {
            json: true,
            headers: sig.headers,
        },
    );
}

async function ingestEvents(events) {
    return events.length === await warp10.ingest({ className: 'utapi.event' }, events);
}

function opsToResp(operations) {
    return Object.entries(operations)
        .reduce((prev, [key, value]) => {
            prev[operationToResponse[key]] = value;
            return prev;
        }, { ...emptyOperationsResponse });
}

const testCases = [
    {
        desc: 'for a single resource',
        args: { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } },
    },
    {
        desc: 'for multiple resources',
        args: {
            [uuid.v4()]: {
                [uuid.v4()]: [uuid.v4(), uuid.v4(), uuid.v4()],
                [uuid.v4()]: [uuid.v4(), uuid.v4(), uuid.v4()],
            },
            [uuid.v4()]: {
                [uuid.v4()]: [uuid.v4(), uuid.v4(), uuid.v4()],
                [uuid.v4()]: [uuid.v4(), uuid.v4(), uuid.v4()],
            },
            [uuid.v4()]: {
                [uuid.v4()]: [uuid.v4(), uuid.v4(), uuid.v4()],
                [uuid.v4()]: [uuid.v4(), uuid.v4(), uuid.v4()],
            },
        },
    },
];

describe('Test listMetric', function () {
    this.timeout(10000);
    testCases.forEach(testCase => {
        describe(testCase.desc, () => {
            let totals;
            before(async () => {
                const { events, totals: _totals } = generateCustomEvents(
                    getTs(-360),
                    getTs(-60),
                    1000,
                    testCase.args,
                );
                totals = _totals;
                assert(await ingestEvents(events));
            });

            after(async () => {
                await warp10.delete({
                    className: '~.*',
                    start: 0,
                    end: now(),
                });
            });

            const accounts = [];
            const users = [];
            const buckets = [];

            Object.entries(testCase.args)
                .forEach(([account, _users]) => {
                    accounts.push(`account:${account}`);
                    Object.entries(_users).forEach(([user, _buckets]) => {
                        users.push(user);
                        buckets.push(..._buckets);
                    });
                });

            const metricQueries = {
                accounts,
                users,
                buckets,
            };

            Object.entries(metricQueries)
                .forEach(query => {
                    const [level, resources] = query;
                    it(`should get metrics for ${level}`, async () => {
                        const resp = await listMetrics(...query, getTs(-500), getTs(0));
                        assert(Array.isArray(resp.body));

                        const { body } = resp;
                        assert.deepStrictEqual(body.map(r => r[metricResponseKeys[level]]), resources);

                        body.forEach(metric => {
                            const key = metric[metricResponseKeys[level]];
                            const _key = level === 'accounts' ? key.split(':')[1] : key;
                            const expected = totals[level][_key];
                            assert.deepStrictEqual(metric.operations, opsToResp(expected.ops));
                            assert.strictEqual(metric.incomingBytes, expected.in);
                            assert.strictEqual(metric.outgoingBytes, expected.out);
                            assert.deepStrictEqual(metric.storageUtilized, [0, expected.bytes]);
                            assert.deepStrictEqual(metric.numberOfObjects, [0, expected.count]);
                        });
                    });
                });
        });
    });

    it('should return 0 in metrics are negative', async () => {
        const bucket = `imabucket-${uuid.v4()}`;
        const account = `imaaccount-${uuid.v4()}`;
        const event = new UtapiMetric({
            timestamp: getTs(0),
            bucket,
            account,
            objectDelta: -1,
            sizeDelta: -1,
            incomingBytes: -1,
            outgoingBytes: -1,
            operationId: 'putObject',
        });

        await ingestEvents([event]);

        const bucketResp = await listMetrics('buckets', [bucket], getTs(-1), getTs(1));
        assert(Array.isArray(bucketResp.body));

        const [bucketMetric] = bucketResp.body;
        assert.deepStrictEqual(bucketMetric.storageUtilized, [0, 0]);
        assert.deepStrictEqual(bucketMetric.numberOfObjects, [0, 0]);
        assert.deepStrictEqual(bucketMetric.incomingBytes, 0);
        assert.deepStrictEqual(bucketMetric.outgoingBytes, 0);

        const accountResp = await listMetrics('accounts', [account], getTs(-1), getTs(1));
        assert(Array.isArray(accountResp.body));

        const [accountMetric] = accountResp.body;
        assert.deepStrictEqual(accountMetric.storageUtilized, [0, 0]);
        assert.deepStrictEqual(accountMetric.numberOfObjects, [0, 0]);
        assert.deepStrictEqual(accountMetric.incomingBytes, 0);
        assert.deepStrictEqual(accountMetric.outgoingBytes, 0);
    });

    it('should return a 403 if unauthorized', async () => {
        const resp = await listMetrics('buckets', ['test'], getTs(-1), getTs(1), true);
        assert.strictEqual(resp.statusCode, 403);
    });

    it('should use the current timestamp for "end" if it is not provided', async () => {
        const resp = await listMetrics('buckets', ['test'], getTs(-1));
        assert.strictEqual(resp.timeRange.length, 2);
    });
});
