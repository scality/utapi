const vaultclient = require('vaultclient');

/**
@class Vault
* Creates a vault instance for authentication and authorization
*/

class Vault {

    constructor(config) {
        const { host, port } = config.vaultd;
        if (config.https) {
            const { key, cert, ca } = config.https;
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
        const { accessKey, signatureFromRequest, region, scopeDate,
            stringToSign }
            = params.data;
        const log = params.log;
        log.debug('authenticating V4 request');
        const serializedRCs = requestContexts.map(rc => rc.serialize());
        this._client.verifySignatureV4(stringToSign, signatureFromRequest,
            accessKey, region, scopeDate, { reqUid: log.getSerializedUids(),
            requestContext: serializedRCs }, (err, authInfo) => {
                if (err) {
                    log.trace('error from vault', { error: err });
                    return callback(err);
                }
                return callback(null,
                    authInfo.message.body.authorizationResults);
            });
    }

    /**
    * Returns canonical Ids for a given list of account Ids
    * @param {string[]} accountIds - list of account ids
    * @param {object} log - Werelogs request logger
    * @param {callback} callback - callback with error and result as params
    * @return {undefined}
    */
    getCanonicalIds(accountIds, log, callback) {
        log.debug('retrieving canonical ids for account ids', {
            method: 'Vault.getCanonicalIds',
        });
        return this._client.getCanonicalIdsByAccountIds(accountIds,
            { reqUid: log.getSerializedUids(), logger: log }, callback);
    }

}

module.exports = Vault;
