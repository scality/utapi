const http = require('http');
const url = require('url');

const port = process.env.VAULT_PORT || 8500;

class Vault {
    constructor() {
        this._server = null;
    }

    static _onRequest(req, res) {
        res.writeHead(200);
        const { query } = url.parse(req.url, true);
        if (query.Action === 'AccountsCanonicalIds') {
            let body;
            if (Array.isArray(query.accountIds)) {
                body = query.accountIds.map(id => ({
                    accountId: id,
                    canonicalId: id.split(':')[1],
                }));
            } else {
                body = [{
                    accountId: query.accountIds,
                    canonicalId: query.accountIds.split(':')[1],
                }];
            }
            res.write(JSON.stringify(body));
        }
        return res.end();
    }

    start() {
        this._server = http.createServer(Vault._onRequest).listen(port);
    }

    end() {
        this._server.close();
    }
}

const vault = new Vault();

['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(eventName => {
    process.on(eventName, () => process.exit(0));
});

// eslint-disable-next-line no-console
console.log('Starting Vault Mock...');
vault.start();
