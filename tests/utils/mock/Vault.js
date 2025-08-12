const http = require('http');
const url = require('url');
const querystring = require('querystring');

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

        if (req.method === 'GET') {
            Vault._checkSecurityToken(query, res);
            return;
        } else if (req.method === 'POST') {
            const body = [];
            req.on('data', chunk => {
                body.push(chunk);
            });
            req.on('end', () => {
                const data = querystring.parse(Buffer.concat(body).toString());
                Vault._checkSecurityToken(data, res);
            });
            return;
        }

        res.writeHead(200);
        res.end();
    }

    static _checkSecurityToken(reqData, res) {
        if (reqData.requestContext) {
            const reqCtx = JSON.parse(reqData.requestContext);
            if (reqCtx?.headers['x-amz-security-token'] && !reqData.securityToken) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify({ code: 'InvalidSecurityToken', message: 'Security token is missing' }));
                res.end();
                return;
            }
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
