import vaultclient from 'vaultclient';

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
     * @param {object} params - contains accessKey (string),
     * signatureFromRequest (string), region (string),
     * stringToSign (string) and log (object)
     * @param {RequestContext []} requestContexts - an array of
     * RequestContext instances which contain information
     * for policy authorization check
     * @param {function} callback - cb(err)
     * @return {undefined}
    */
    authenticateV4Request(params, requestContexts, callback) {
        const { accessKey, signatureFromRequest, region, scopeDate,
            stringToSign, log }
            = params;
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

}

export default Vault;
