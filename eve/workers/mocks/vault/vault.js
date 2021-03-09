const http = require('http');
const url = require('url');

const port = process.env.VAULT_PORT || 8500;

const unauthResp = {
    ErrorResponse: {
        $: {
            xmlns: 'https://iam.amazonaws.com/doc/2010-05-08/',
        },
        Error: {
            Code: 'InvalidAccessKeyId',
            Message: 'The AWS access key Id you provided does not exist in our records.',
        },
        RequestId: '97f22e2dba45bca2a5cd:fb375c22ed4ea7500691',
    },
};


class Vault {
    constructor() {
        this._server = null;
    }

    static _onRequest(req, res) {
        const { query } = url.parse(req.url, true);
        if (query.accessKey === 'invalidKey') {
            res.writeHead(403);
            res.write(JSON.stringify(unauthResp));
        } else if (query.Action === 'AccountsCanonicalIds') {
            res.writeHead(200);
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
