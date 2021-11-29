/* eslint-disable no-undef-init */
const { IAM } = require('aws-sdk');
const vaultclient = require('vaultclient');
const fs = require('fs');
const uuid = require('uuid');

const adminCredentials = {
    accessKey: 'D4IT2AWSB588GO5J9T00',
    secretKey: 'UEEu8tYlsOGGrgf4DAiSZD6apVNPUWqRiPG0nTB6',
};


const internalServiceAccountId = '000000000000';
const internalServiceAccountName = 'scality-internal-services';
const internalServiceAccountEmail = 'scality@internal';
const internalServiceUserName = 'service-utapi-user';

class VaultClient {
    /**
     * Get endpoint information
     *
     * @return {object} Vault endpoint information
     */
    static getEndpointInformation() {
        let host = '127.0.0.1';
        let port = 8600;
        let ca = undefined;
        let cert = undefined;
        let key = undefined;
        if (process.env.VAULT_ENDPOINT) {
            const res = /^https?:\/\/([^:]*)(:[0-9]+)?\/?$/.exec(
                process.env.VAULT_ENDPOINT,
            );
            // eslint-disable-next-line prefer-destructuring
            [host] = res[1];
            port = parseInt(res[2].substring(1), 10);
            const https = process.env.VAULT_ENDPOINT.startsWith('https://');
            if (https) {
                ca = fs.readFileSync(process.env.SSL_CA || '/conf/ca.crt',
                    'ascii');
                cert = fs.readFileSync(process.env.SSL_CERT || '/conf/test.crt',
                    'ascii');
                key = fs.readFileSync(process.env.SSL_KEY || '/conf/test.key',
                    'ascii');
            }
        }
        return {
            host,
            port,
            ca,
            cert,
            key,
        };
    }

    /**
     * Get an admin client
     *
     * @return {vaultclient.Client} Vault client for admin calls
     */
    static getAdminClient() {
        const info = VaultClient.getEndpointInformation();
        const adminClient = new vaultclient.Client(info.host, info.port,
            info.ca !== undefined, undefined, undefined, info.ca, false,
            adminCredentials.accessKey, adminCredentials.secretKey);
        return adminClient;
    }

    /**
     * Get an s3 client
     *
     * @return {vaultclient.Client} Vault client for s3
     */
    static getServiceClient() {
        const info = VaultClient.getEndpointInformation();
        const adminClient = new vaultclient.Client(info.host, info.port - 100,
            info.ca !== undefined, info.key, info.cert, info.ca);
        return adminClient;
    }

    static getIAMClient(credentials) {
        const endpoint = process.env.VAULT_ENDPOINT || 'http://localhost:8600';
        const info = {
            endpoint,
            sslEnabled: false,
            region: 'us-east-1',
            apiVersion: '2010-05-08',
            signatureVersion: 'v4',
            accessKeyId: credentials.accessKey,
            secretAccessKey: credentials.secretKey,
            maxRetries: 0,
        };
        return new IAM(info);
    }

    static async createAccount(name) {
        const client = VaultClient.getAdminClient();
        return new Promise((resolve, reject) =>
            client.createAccount(
                name,
                { email: `${name}@example.com` },
                (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(res.account);
                },
            ));
    }

    static async createAccountKeys(account) {
        const client = VaultClient.getAdminClient();
        return new Promise((resolve, reject) =>
            client.generateAccountAccessKey(
                account.name,
                (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve({
                        accessKey: res.id,
                        secretKey: res.value,
                    });
                },
            ));
    }

    static async createAccountAndKeys(name) {
        const account = await VaultClient.createAccount(name);
        const creds = await VaultClient.createAccountKeys(account);
        return {
            ...account,
            ...creds,
        };
    }

    static async createUser(parentAccount, name, path) {
        const client = VaultClient.getIAMClient(parentAccount);
        const { User: user } = await client.createUser({ UserName: name, Path: path }).promise();
        return {
            name,
            id: user.UserId,
            arn: user.Arn,
            account: user.Arn.split(':')[4],
        };
    }

    static async createUserKeys(parentAccount, name) {
        const client = VaultClient.getIAMClient(parentAccount);
        const { AccessKey: creds } = await client.createAccessKey({ UserName: name }).promise();
        return {
            accessKey: creds.AccessKeyId,
            secretKey: creds.SecretAccessKey,
        };
    }

    static async createUserAndKeys(parentAccount, name, path) {
        const user = await VaultClient.createUser(parentAccount, name, path);
        const creds = await VaultClient.createUserKeys(parentAccount, name);
        return {
            ...user,
            ...creds,
        };
    }

    static templateUtapiPolicy(level, resource) {
        return JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: `utapiMetrics-${uuid.v4()}`.replace(/-/g, ''),
                    Action: ['utapi:ListMetrics'],
                    Effect: 'Allow',
                    Resource: `arn:scality:utapi:::${level}/${resource}`,
                },
            ],
        });
    }

    static async createAndAttachUtapiPolicy(parentAccount, user, level, resource) {
        const client = VaultClient.getIAMClient(parentAccount);
        const PolicyDocument = VaultClient.templateUtapiPolicy(level, resource);
        const PolicyName = `utapi-test-policy-${uuid.v4()}`;
        const res = await client.createPolicy({ PolicyName, PolicyDocument }).promise();
        const { Arn: PolicyArn } = res.Policy;
        await client.attachUserPolicy({ PolicyArn, UserName: user.name }).promise();
    }

    static async createInternalServiceAccount() {
        const client = VaultClient.getAdminClient();
        return new Promise((resolve, reject) =>
            client.createAccount(
                internalServiceAccountName,
                {
                    email: internalServiceAccountEmail,
                    externalAccountId: internalServiceAccountId,
                    disableSeed: true,
                },
                (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(res.account);
                },
            ));
    }

    static async createInternalServiceAccountAndKeys() {
        const account = await VaultClient.createInternalServiceAccount();
        const creds = await VaultClient.createAccountKeys(account);
        return {
            ...account,
            ...creds,
        };
    }

    static async getUserByName(parentAccount, name) {
        const client = VaultClient.getIAMClient(parentAccount);
        const { User: user } = await client.getUser({ UserName: name }).promise();
        return {
            name,
            id: user.UserId,
            arn: user.Arn,
            account: user.Arn.split(':')[4],
        };
    }

    static async getAttachedPolicies(parentAccount, user) {
        const client = VaultClient.getIAMClient(parentAccount);
        const res = await client.listAttachedUserPolicies({ UserName: user.name }).promise();
        const { AttachedPolicies: attached } = res;
        const policies = await Promise.all(
            attached.map(
                ({ PolicyArn }) => client.getPolicyVersion({ PolicyArn, VersionId: 'v1' })
                    .promise()
                    .then(({ PolicyVersion }) => ({
                        arn: PolicyArn,
                        document: JSON.parse(decodeURIComponent(PolicyVersion.Document)),
                    })),
            ),
        );
        return policies;
    }

    static async getInternalServiceUserAndPolicies(parentAccount) {
        const user = await VaultClient.getUserByName(parentAccount, internalServiceUserName);
        const policies = await VaultClient.getAttachedPolicies(parentAccount, user);
        return {
            ...user,
            policies,
        };
    }

    static async getAccountUsers(parentAccount) {
        const client = VaultClient.getIAMClient(parentAccount);
        const { Users } = await client.listUsers({}).promise();

        return Users.map(user => ({
            arn: user.Arn,
            id: user.UserId,
            name: user.UserName,
        }));
    }

    static async detachUserPolicies(parentAccount, user) {
        const client = VaultClient.getIAMClient(parentAccount);
        const policies = await VaultClient.getAttachedPolicies(parentAccount, user);
        return Promise.all(
            policies.map(policy => client.detachUserPolicy({
                PolicyArn: policy.arn,
                UserName: user.name,
            }).promise().then(() => policy.arn)),
        );
    }

    static async deleteAccount(account) {
        return new Promise(
            (resolve, reject) => VaultClient
                .getAdminClient()
                .deleteAccount(
                    account.name,
                    (err, res) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(res);
                    },
                ),
        );
    }

    static async cleanupUsers(parentAccount) {
        const client = VaultClient.getIAMClient(parentAccount);
        const users = await VaultClient.getAccountUsers(parentAccount);
        await Promise.all(
            users.map(async user => {
                const detached = await VaultClient.detachUserPolicies(parentAccount, user);
                await Promise.all(detached.map(PolicyArn => client.deletePolicy({ PolicyArn }).promise()));
                await client.deleteUser({ UserName: user.name }).promise();
            }),
        );
    }

    static async cleanupAccountAndUsers(parentAccount) {
        await VaultClient.cleanupUsers(parentAccount);
        await VaultClient.deleteAccount(parentAccount);
    }
}


module.exports = VaultClient;
