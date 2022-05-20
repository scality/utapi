const assert = require('assert');
const { auth, policies } = require('arsenal');
const vaultclient = require('vaultclient');
const config = require('../config');
const errors = require('../errors');
/**
@class Vault
* Creates a vault instance for authentication and authorization
*/

class VaultWrapper extends auth.Vault {
    constructor(options) {
        let client;
        const { host, port } = options.vaultd;
        if (options.tls) {
            const { key, cert, ca } = options.tls;
            client = new vaultclient.Client(host, port, true, key, cert,
                ca);
        } else {
            client = new vaultclient.Client(host, port);
        }
        super(client, 'vault');
    }

    /**
    * Returns canonical Ids for a given list of account Ids
    * @param {string[]} accountIds - list of account ids
    * @param {object} log - Werelogs request logger
    * @return {Promise} -
    */
    getCanonicalIds(accountIds, log) {
        log.debug('retrieving canonical ids for account ids', {
            method: 'Vault.getCanonicalIds',
            accountIds,
        });
        return new Promise((resolve, reject) =>
            this.client.getCanonicalIdsByAccountIds(accountIds,
                { reqUid: log.getSerializedUids(), logger: log }, (err, res) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!res.message || !res.message.body) {
                        reject(errors.InternalError);
                        return;
                    }
                    resolve(res.message.body.map(acc => ({
                        resource: acc.accountId,
                        id: acc.canonicalId,
                    })));
                }));
    }

    // eslint-disable-next-line class-methods-use-this
    authenticateRequest(request, action, level, resources) {
        const policyContext = new policies.RequestContext(
            request.headers,
            request.query,
            level,
            resources,
            request.ip,
            request.ctx.encrypted,
            action,
            'utapi',
        );

        return new Promise((resolve, reject) => {
            auth.server.doAuth(
                request,
                request.logger.logger,
                (err, authInfo, authRes) => {
                    if (err && err.is && (err.is.InvalidAccessKeyId || err.is.AccessDenied)) {
                        resolve({ authed: false });
                        return;
                    }
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Only IAM users will return authorizedResources
                    let authorizedResources = resources;
                    if (authRes) {
                        authorizedResources = authRes
                            .filter(resource => resource.isAllowed)
                            .map(resource => {
                                // resource.arn should be of format:
                                // arn:scality:utapi:::resourcetype/resource
                                assert(typeof resource.arn === 'string');
                                assert(resource.arn.indexOf('/') > -1);
                                return resource.arn.split('/')[1];
                            });
                    }

                    resolve({ authed: true, authInfo, authorizedResources });
                }, 's3', [policyContext],
            );
        });
    }

    getUsersById(userIds, log) {
        log.debug('retrieving user arns for user ids', {
            method: 'Vault.getUsersById',
            userIds,
        });
        return new Promise((resolve, reject) =>
            this.client.getUsersById(userIds,
                { reqUid: log.getSerializedUids(), logger: log }, (err, res) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!res.message || !res.message.body) {
                        reject(errors.InternalError);
                        return;
                    }
                    resolve(res.message.body);
                }));
    }
}

const vault = new VaultWrapper(config);
auth.setHandler(vault);

module.exports = {
    VaultWrapper,
    vault,
};
