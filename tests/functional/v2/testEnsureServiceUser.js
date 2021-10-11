/* eslint-disable no-console */
const assert = require('assert');
const { exec } = require('child_process');
const path = require('path');

const vaultclient = require('../../utils/vaultclient');

const ensureServiceUser = path.resolve(__dirname, '../../../bin/ensureServiceUser');

const expectedPolicyDocument = {
    Version: '2012-10-17',
    Statement: {
        Effect: 'Allow',
        Action: 'utapi:ListMetrics',
        Resource: 'arn:scality:utapi:::*/*',
    },
};

async function execPath(path, args, env) {
    const proc = exec(`${path} ${args.join(' ')}`, {
        env,
        stdio: 'pipe',
    });
    proc.stdout.on('data', data => console.log(data.toString()));
    proc.stderr.on('data', data => console.error(data.toString()));
    return new Promise((resolve, reject) => {
        proc.on('error', err => reject(err));
        proc.on('exit', exitCode => {
            if (exitCode !== 0) {
                reject(new Error(`ensureServiceUser exited with non-zero code ${exitCode}`));
                return;
            }
            resolve();
        });
    });
}

// Allow overriding the path to the node binary
// useful to work around issues when running locally and using a node version manager
const NODE_INTERPRETER = process.env.NODE_INTERPRETER ? process.env.NODE_INTERPRETER : 'node';

function executeScript(account) {
    return execPath(
        NODE_INTERPRETER,
        [ensureServiceUser, 'apply', 'service-utapi-user'],
        {
            AWS_ACCESS_KEY_ID: account.accessKey,
            AWS_SECRET_ACCESS_KEY: account.secretKey,
            AWS_REGION: 'us-east-1',
            NODE_TLS_REJECT_UNAUTHORIZED: '0',
        },
    );
}

describe('test bin/ensureServiceUser', () => {
    let adminAccount;

    before(async () => {
        adminAccount = await vaultclient.createInternalServiceAccountAndKeys();
    });

    after(() => vaultclient.cleanupAccountAndUsers(adminAccount));

    beforeEach(() => executeScript(adminAccount));
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
        await executeScript(adminAccount);
        const res2 = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res2.policies.length, 1);
        assert.deepStrictEqual(res2.policies[0].document, expectedPolicyDocument);
    });

    it('should create and attach a policy if the user already exists', async () => {
        const detached = await vaultclient.detachUserPolicies(adminAccount, { name: 'service-utapi-user' });
        assert.strictEqual(detached.length, 1);
        const client = vaultclient.getIAMClient(adminAccount);
        await Promise.all(detached.map(PolicyArn => client.deletePolicy({ PolicyArn }).promise()));
        await executeScript(adminAccount);

        const res = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res.policies.length, 1);
        assert.deepStrictEqual(res.policies[0].document, expectedPolicyDocument);
    });

    it('should not create the policy if it already exists', async () => {
        await vaultclient.detachUserPolicies(adminAccount, { name: 'service-utapi-user' });
        await executeScript(adminAccount);
        const res = await vaultclient.getInternalServiceUserAndPolicies(adminAccount);
        assert.strictEqual(res.policies.length, 1);
        assert.deepStrictEqual(res.policies[0].document, expectedPolicyDocument);
    });
});
