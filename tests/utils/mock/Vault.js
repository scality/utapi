const http = require('http');

const config = require('../../../src/lib/Config').default;

class Vault {
    _onRequest(req, res) {
        res.writeHead(200);
        return res.end();
    }

    start() {
        const { port } = config.vaultd;
        return http.createServer(this._onRequest).listen(port);
    }
}

module.exports = Vault;
