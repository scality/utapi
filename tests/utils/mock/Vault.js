/* eslint-disable class-methods-use-this */
const http = require('http');
const url = require('url');

const config = require('../../../lib/Config');
const { CANONICAL_ID } = require('./values');

class Vault {
    constructor() {
        this._server = null;
    }

    _onRequest(req, res) {
        const { query } = url.parse(req.url, true);
        if (query.Action === 'AccountsCanonicalIds') {
            const body = JSON.stringify([{ canonicalId: CANONICAL_ID, accountId: query.accountIds }]);
            res.writeHead(200);
            res.write(body);
            res.end();
            return;
        }

        const reqCtx = JSON.parse(query.requestContext);
        if (reqCtx.headers['x-amz-security-token'] && !query.securityToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.write(JSON.stringify({ code: 'InvalidSecurityToken', message: 'Security token is missing' }));
            res.end();
            return;
        }

        res.writeHead(200);
        res.end();
    }

    start() {
        const { port } = config.vaultd;
        this._server = http.createServer(this._onRequest).listen(port);
    }

    end() {
        this._server.close();
    }
}

module.exports = Vault;
