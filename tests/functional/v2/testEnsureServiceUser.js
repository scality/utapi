const assert = require('assert');

const vaultclient = require('../../utils/vaultclient');

const expectedPolicyDocument = {
    Version: '2012-10-17',
    Statement: {
        Effect: 'Allow',
        Action: 'utapi:ListMetrics',
        Resource: 'arn:scality:utapi:::*/*',
    },
};

describe('test bin/ensureServiceUser', () => {
    let adminAccount;

    before(async () => {
        adminAccount = await vaultclient.createInternalServiceAccountAndKeys();
    });

    after(() => vaultclient.cleanupAccountAndUsers(adminAccount));

    beforeEach(() => vaultclient.ensureServiceUser(adminAccount));
    afterEach(() => vaultclient.cleanupUsers(adminAccount));

    it('should create the service user and attach a policy', async () => {
        const res = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res.policies.length, 1);
        assert.deepStrictEqual(res.policies[0].document, expectedPolicyDocument);
    });

    it('should exit with success on subsequent runs', async () => {
        const res = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res.policies.length, 1);
        assert.deepStrictEqual(res.policies[0].document, expectedPolicyDocument);
        await vaultclient.ensureServiceUser(adminAccount);
        const res2 = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res2.policies.length, 1);
        assert.deepStrictEqual(res2.policies[0].document, expectedPolicyDocument);
    });

    it('should create and attach a policy if the user already exists', async () => {
        const detached = await vaultclient.detachUserPolicies(adminAccount, { name: 'service-utapi-user' });
        assert.strictEqual(detached.length, 1);
        const client = vaultclient.getIAMClient(adminAccount);
        await Promise.all(detached.map(PolicyArn => client.deletePolicy({ PolicyArn }).promise()));
        await vaultclient.ensureServiceUser(adminAccount);

        const res = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res.policies.length, 1);
        assert.deepStrictEqual(res.policies[0].document, expectedPolicyDocument);
    });

    it('should not create the policy if it already exists', async () => {
        await vaultclient.detachUserPolicies(adminAccount, { name: 'service-utapi-user' });
        await vaultclient.ensureServiceUser(adminAccount);
        const res = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res.policies.length, 1);
        assert.deepStrictEqual(res.policies[0].document, expectedPolicyDocument);
    });
});
