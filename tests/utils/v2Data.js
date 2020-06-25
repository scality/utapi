const uuid = require('uuid');

const { UtapiMetric } = require('../../libV2/models');
const { operations } = require('../../libV2/constants');
const { ResponseContainer } = require('../../libV2/models');

function range(n, step) {
    const vals = [...Array(n).keys()];
    if (step) {
        return vals.map(i => i * step);
    }
    return vals;
}

function randInt(withNegative = true) {
    const x = Math.floor(Math.random() * 10000);
    return withNegative && Math.random() < 0.5 ? -x : x;
}

function maybe(func) {
    return Math.random() < 0.5 && func();
}

function randChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

const possibleFields = {
    bucket: uuid.v4,
    object: uuid.v4,
    versionId: uuid.v4,
    user: uuid.v4,
};

const requiredFields = {
    uuid: uuid.v4,
    operationId: () => randChoice(operations),
    account: uuid.v4,
    location: uuid.v4,
    objectDelta: randInt,
    sizeDelta: randInt,
    incomingBytes: () => randInt(false),
    outgoingBytes: () => randInt(false),
};


function makeEvent(timestamp) {
    const fields = Object.entries(requiredFields).reduce((fields, [key, func]) => {
        // eslint-disable-next-line no-param-reassign
        fields[key] = func();
        return fields;
    }, {});
    Object.entries(possibleFields).forEach(
        ([key, func]) => maybe(
            () => { fields[key] = func(); },
        ),
    );
    return new UtapiMetric({
        timestamp,
        ...fields,
    });
}

function generateFakeEvents(start, stop, count) {
    const duration = stop - start;
    const eventsEvery = duration / count;
    return range(count, eventsEvery).map(i => makeEvent(Math.floor(start + i)));
}


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


module.exports = {
    generateFakeEvents,
    templateRequest,
    ExpressResponseStub,
    stubLogger,
};
