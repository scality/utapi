const http = require('http');
const url = require('url');

const config = require('../../../lib/Config');
const { CANONICAL_ID } = require('./values');

class Vault {
    constructor() {
        this._server = null;
    }

    _onRequest(req, res) {
        res.writeHead(200);
        const { query } = url.parse(req.url, true);
        if (query.Action === 'AccountsCanonicalIds') {
            const body = JSON.stringify([{ canonicalId: CANONICAL_ID }]);
            res.write(body);
        }
        return res.end();
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
