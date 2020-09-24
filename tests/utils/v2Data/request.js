const { ResponseContainer, RequestContext } = require('../../../libV2/models');

class ExpressResponseStub {
    constructor() {
        this._status = null;
        this._body = null;
        this._redirect = null;
    }

    status(code) {
        this._status = code;
        return this;
    }

    sendStatus(code) {
        this._status = code;
    }

    send(body) {
        this._body = body;
        return this;
    }

    redirect(url) {
        this._redirect = url;
        return this;
    }
}

const stubLogger = {
    addDefaultFields: () => {},
    debug: () => {},
    info: () => {},
    trace: () => {},
    with: () => stubLogger,
    warn: () => {},
    fatal: () => {},
    error: () => {},
};

stubLogger.logger = stubLogger;


function templateRequest(overrides) {
    const results = new ResponseContainer();

    return {
        ip: '127.0.0.1',
        socket: { remotePort: 12345 },
        headers: { host: 'example.com' },
        connection: { encrypted: false },
        method: 'GET',
        originalUrl: 'http://example.com/hello/world',
        hostname: 'example.com',
        url: '/hello/world',
        swagger: {
            operation: {
                'x-router-controller': 'internal',
                'operationId': 'healthcheck',
            },
            params: {},
        },
        logger: stubLogger,
        results,
        ...(overrides || {}),
    };
}

function templateContext(overrides) {
    const request = templateRequest(overrides);
    return new RequestContext(request);
}

module.exports = {
    templateRequest,
    templateContext,
    ExpressResponseStub,
    stubLogger,
};
