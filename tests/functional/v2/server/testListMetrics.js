/* eslint-disable func-names */
const assert = require('assert');
const needle = require('needle');
const uuid = require('uuid');
const aws4 = require('aws4');

const { clients: warp10Clients } = require('../../../../libV2/warp10');
const { convertTimestamp, now } = require('../../../../libV2/utils');
const { operationToResponse } = require('../../../../libV2/constants');

const { generateCustomEvents } = require('../../../utils/v2Data');
const { BucketD } = require('../../../utils/mock/');
const vaultclient = require('../../../utils/vaultclient');

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

async function listMetrics(level, resources, start, end, credentials) {
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

    const { accessKey: accessKeyId, secretKey: secretAccessKey } = credentials;
    const _credentials = {
        accessKeyId,
        secretAccessKey,
    };

    const sig = aws4.sign(headers, _credentials);

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

function assertMetricResponse(provided, expected) {
    assert.deepStrictEqual(provided.operations, opsToResp(expected.ops));
    assert.strictEqual(provided.incomingBytes, expected.in);
    assert.strictEqual(provided.outgoingBytes, expected.out);
    assert.deepStrictEqual(provided.storageUtilized, [0, expected.bytes]);
    assert.deepStrictEqual(provided.numberOfObjects, [0, expected.count]);
}

describe('Test listMetric', function () {
    this.timeout(10000);
    const bucketd = new BucketD(true);

    let account;
    let user;
    let otherAccount;
    let otherUser;
    let serviceAccount;
    let serviceUser;
    const bucket = uuid.v4();
    const otherBucket = uuid.v4();
    let totals;

    before(async () => {
        account = await vaultclient.createAccountAndKeys(uuid.v4());
        user = await vaultclient.createUserAndKeys(account, uuid.v4());
        otherAccount = await vaultclient.createAccountAndKeys(uuid.v4());
        otherUser = await vaultclient.createUser(otherAccount, uuid.v4());
        serviceAccount = await vaultclient.createInternalServiceAccountAndKeys();
        serviceUser = await vaultclient.createUserAndKeys(serviceAccount, 'service-utapi-user', '/scality-internal/');

        await Promise.all([
            vaultclient.createAndAttachUtapiPolicy(account, user, 'buckets', '*'),
            vaultclient.createAndAttachUtapiPolicy(account, user, 'accounts', '*'),
            vaultclient.createAndAttachUtapiPolicy(account, user, 'users', '*'),
            vaultclient.createAndAttachUtapiPolicy(serviceAccount, serviceUser, 'buckets', '*'),
            vaultclient.createAndAttachUtapiPolicy(serviceAccount, serviceUser, 'accounts', '*'),
            vaultclient.createAndAttachUtapiPolicy(serviceAccount, serviceUser, 'users', '*'),
        ]);

        bucketd.createBucketsWithOwner([
            { name: bucket, owner: account.canonicalId },
            { name: otherBucket, owner: otherAccount.canonicalId },
        ]);
        bucketd.start();

        const { events, totals: _totals } = generateCustomEvents(
            getTs(-360),
            getTs(-60),
            1000,
            { [account.canonicalId]: { [user.id]: [bucket] } },
        );
        totals = _totals;
        assert(await ingestEvents(events));
    });

    after(async () => {
        bucketd.end();
        await warp10.delete({
            className: '~.*',
            start: 0,
            end: now(),
        });
        await vaultclient.cleanupAccountAndUsers(account);
        await vaultclient.cleanupAccountAndUsers(otherAccount);
        await vaultclient.cleanupAccountAndUsers(serviceAccount);
    });

    describe('test account credentials', () => {
        it('should list metrics for the same account', async () => {
            const resp = await listMetrics('accounts', [account.id], getTs(-500), getTs(0), account);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.accounts]), [account.id]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.accounts[account.canonicalId]);
            });
        });

        it("should list metrics for an account's user", async () => {
            const resp = await listMetrics('users', [user.id], getTs(-500), getTs(0), account);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.users]), [user.id]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.users[user.id]);
            });
        });

        it("should list metrics for an account's bucket", async () => {
            const resp = await listMetrics('buckets', [bucket], getTs(-500), getTs(0), account);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.buckets]), [bucket]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.buckets[bucket]);
            });
        });

        it('should return Access Denied for a different account', async () => {
            const resp = await listMetrics('accounts', [otherAccount.id], getTs(-500), getTs(0), account);
            assert.strictEqual(resp.statusCode, 403);
            assert.deepStrictEqual(resp.body, { code: 'AccessDenied', message: 'Access Denied' });
        });

        it("should return Access Denied for a different account's user", async () => {
            const resp = await listMetrics('users', [otherUser.id], getTs(-500), getTs(0), account);
            assert.strictEqual(resp.statusCode, 403);
            assert.deepStrictEqual(resp.body, { code: 'AccessDenied', message: 'Access Denied' });
        });

        it("should return Access Denied for a different account's bucket", async () => {
            const resp = await listMetrics('buckets', [otherBucket], getTs(-500), getTs(0), account);
            assert.strictEqual(resp.statusCode, 403);
            assert.deepStrictEqual(resp.body, { code: 'AccessDenied', message: 'Access Denied' });
        });
    });

    describe('test user credentials', () => {
        it('should list metrics for the same account', async () => {
            const resp = await listMetrics('accounts', [account.id], getTs(-500), getTs(0), user);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.accounts]), [account.id]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.accounts[account.canonicalId]);
            });
        });

        it("should list metrics for a user's account", async () => {
            const resp = await listMetrics('users', [user.id], getTs(-500), getTs(0), user);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.users]), [user.id]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.users[user.id]);
            });
        });

        it("should list metrics for an user's bucket", async () => {
            const resp = await listMetrics('buckets', [bucket], getTs(-500), getTs(0), user);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.buckets]), [bucket]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.buckets[bucket]);
            });
        });

        it("should return Access Denied for a different user's account", async () => {
            const resp = await listMetrics('accounts', [otherAccount.id], getTs(-500), getTs(0), user);
            assert.strictEqual(resp.statusCode, 403);
            assert.deepStrictEqual(resp.body, { code: 'AccessDenied', message: 'Access Denied' });
        });

        it("should return Access Denied for a different account's user", async () => {
            const resp = await listMetrics('users', [otherUser.id], getTs(-500), getTs(0), user);
            assert.strictEqual(resp.statusCode, 403);
            assert.deepStrictEqual(resp.body, { code: 'AccessDenied', message: 'Access Denied' });
        });

        it("should return Access Denied for a different account's  bucket", async () => {
            const resp = await listMetrics('buckets', [otherBucket], getTs(-500), getTs(0), user);
            assert.strictEqual(resp.statusCode, 403);
            assert.deepStrictEqual(resp.body, { code: 'AccessDenied', message: 'Access Denied' });
        });
    });

    describe('test service user credentials', () => {
        it('should list metrics for an account', async () => {
            const resp = await listMetrics('accounts', [account.id], getTs(-500), getTs(0), serviceUser);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.accounts]), [account.id]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.accounts[account.canonicalId]);
            });
        });

        it('should list metrics for a user', async () => {
            const resp = await listMetrics('users', [user.id], getTs(-500), getTs(0), serviceUser);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.users]), [user.id]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.users[user.id]);
            });
        });

        it('should list metrics for a bucket', async () => {
            const resp = await listMetrics('buckets', [bucket], getTs(-500), getTs(0), serviceUser);
            assert(Array.isArray(resp.body));
            const { body } = resp;
            assert.deepStrictEqual(body.map(r => r[metricResponseKeys.buckets]), [bucket]);
            body.forEach(metric => {
                assertMetricResponse(metric, totals.buckets[bucket]);
            });
        });
    });
});
