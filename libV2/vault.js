const assert = require('assert');
const { auth, policies } = require('arsenal');
const vaultclient = require('vaultclient');
const config = require('./config');
const errors = require('./errors');

/**
@class Vault
* Creates a vault instance for authentication and authorization
*/

class Vault {
    constructor(options) {
        const { host, port } = options.vaultd;
        if (options.tls) {
            const { key, cert, ca } = options.tls;
            this._client = new vaultclient.Client(host, port, true, key, cert,
                ca);
        } else {
            this._client = new vaultclient.Client(host, port);
        }
    }

    /** authenticateV4Request
    *
    * @param {object} params - the authentication parameters as returned by
    *                          auth.extractParams
    * @param {number} params.version - shall equal 4
    * @param {string} params.data.accessKey - the user's accessKey
    * @param {string} params.data.signatureFromRequest - the signature read from
    *                                                    the request
    * @param {string} params.data.region - the AWS region
    * @param {string} params.data.stringToSign - the stringToSign
    * @param {string} params.data.scopeDate - the timespan to allow the request
    * @param {string} params.data.authType - the type of authentication
    *   (query or header)
    * @param {string} params.data.signatureVersion - the version of the
    *                                                signature (AWS or AWS4)
    * @param {number} params.data.signatureAge - the age of the signature in ms
    * @param {string} params.data.log - the logger object
     * @param {RequestContext []} requestContexts - an array of
     * RequestContext instances which contain information
     * for policy authorization check
     * @param {function} callback - cb(err)
     * @return {undefined}
    */
    authenticateV4Request(params, requestContexts, callback) {
        const {
            accessKey, signatureFromRequest, region, scopeDate,
            stringToSign,
        } = params.data;
        const { log } = params;
        log.debug('authenticating V4 request');
        const serializedRCs = requestContexts.map(rc => rc.serialize());
        this._client.verifySignatureV4(
            stringToSign, signatureFromRequest,
            accessKey, region, scopeDate,
            { reqUid: log.getSerializedUids(), requestContext: serializedRCs },
            (err, authInfo) => {
                if (err) {
                    log.trace('error from vault', { error: err });
                    return callback(err);
                }
                return callback(null,
                    authInfo.message.body.authorizationResults);
            },
        );
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
        });
        return new Promise((resolve, reject) =>
            this._client.getCanonicalIdsByAccountIds(accountIds,
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
}

const vault = new Vault(config);
auth.setHandler(vault);

async function translateResourceIds(level, resources, log) {
    if (level === 'accounts') {
        return vault.getCanonicalIds(resources, log);
    }

    return resources.map(resource => ({ resource, id: resource }));
}

async function authenticateRequest(request, action, level, resources) {
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
        auth.server.doAuth(request, request.logger.logger, (err, res) => {
            if (err && (err.InvalidAccessKeyId || err.AccessDenied)) {
                resolve([false]);
                return;
            }
            if (err) {
                reject(err);
                return;
            }
            // Will only have res if request is from a user rather than an account
            let authorizedResources = resources;
            if (res) {
                try {
                    authorizedResources = res.reduce(
                        (authed, result) => {
                            if (result.isAllowed) {
                                // result.arn should be of format:
                                // arn:scality:utapi:::resourcetype/resource
                                assert(typeof result.arn === 'string');
                                assert(result.arn.indexOf('/') > -1);
                                const resource = result.arn.split('/')[1];
                                authed.push(resource);
                                request.logger.trace('access granted for resource', { resource });
                            }
                            return authed;
                        }, [],
                    );
                } catch (err) {
                    reject(err);
                }
            } else {
                request.logger.trace('granted access to all resources');
            }

            resolve([
                authorizedResources.length !== 0,
                authorizedResources,
            ]);
        }, 's3', [policyContext]);
    });
}

async function translateAndAuthorize(request, action, level, resources) {
    const [authed, authorizedResources] = await authenticateRequest(request, action, level, resources);
    if (!authed) {
        return [authed];
    }
    const translated = await translateResourceIds(level, authorizedResources, request.logger.logger);
    return [authed, translated];
}

module.exports = {
    authenticateRequest,
    translateAndAuthorize,
    Vault,
    vault,
};
