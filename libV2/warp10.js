const { Warp10 } = require('@senx/warp10');
const assert = require('assert');
const { eventFieldsToWarp10, warp10EventType } = require('./constants');
const _config = require('./config');
const { LoggerContext } = require('./utils');
const errors = require('./errors');

const moduleLogger = new LoggerContext({
    module: 'warp10',
});


class Warp10Client {
    constructor(config) {
        this._writeToken = (config && config.writeToken) || 'writeTokenStatic';
        this._readToken = (config && config.readToken) || 'readTokenStatic';
        this._nodeId = (config && config.nodeId) || _config.nodeId;
        const proto = (config && config.tls) ? 'https' : 'http';
        const requestTimeout = (config && config.requestTimeout) || 10000;
        const connectTimeout = (config && config.connectTimeout) || 10000;
        if (config && config.hosts) {
            this._clients = config.hosts
                .map(({ host, port }) => new Warp10(
                    `${proto}://${host}:${port}`,
                    requestTimeout,
                    connectTimeout,
                ));
        } else {
            const host = (config && config.host) || 'localhost';
            const port = (config && config.port) || 4802;
            this._clients = [new Warp10(`${proto}://${host}:${port}`, requestTimeout, connectTimeout)];
        }
    }

    async _wrapCall(func, params) {
        // eslint-disable-next-line no-restricted-syntax
        for (const client of this._clients) {
            try {
                // eslint-disable-next-line no-await-in-loop
                return await func(client, ...params);
            } catch (error) {
                moduleLogger.warn('error during warp10 operation, failing over to next host',
                    { statusCode: error.statusCode, statusMessage: error.statusMessage, error });
            }
        }
        moduleLogger.error('no remaining warp10 hosts to try, unable to complete request');
        throw errors.InternalError;
    }

    static _packEvent(valueType, event) {
        const packed = Object.entries(event.getValue())
            .filter(([key]) => eventFieldsToWarp10[key])
            .reduce((ev, [key, value]) => {
                ev[eventFieldsToWarp10[key]] = value;
                return ev;
            }, {});
        return `${valueType}${JSON.stringify(packed)}`;
    }

    _buildGTSEntry(className, valueType, labels, event) {
        const _labels = this._clients[0].formatLabels({ node: this._nodeId, ...labels });
        const packed = Warp10Client._packEvent(valueType, event);
        return `${event.timestamp}// ${className}${_labels} ${packed}`;
    }

    async _ingest(warp10, metadata, events) {
        const { className, valueType, labels } = metadata;
        assert.notStrictEqual(className, undefined, 'you must provide a className');
        const payload = events.map(
            ev => this._buildGTSEntry(
                className,
                valueType || warp10EventType,
                labels || {},
                ev,
            ),
        );
        const res = await warp10.update(this._writeToken, payload);
        return res.count;
    }

    ingest(...params) {
        return this._wrapCall(
            this._ingest.bind(this),
            params,
        );
    }

    _buildScriptEntry(params) {
        const authInfo = {
            read: this._readToken,
            write: this._writeToken,
        };
        return `'${JSON.stringify(authInfo)}' '${JSON.stringify(params)}'`;
    }

    _buildExecPayload(params) {
        const payload = [this._buildScriptEntry(params.params)];
        if (params.macro) {
            payload.push(`@${params.macro}\n`);
        }
        if (params.script) {
            payload.push(params.script);
        }
        return payload.join('\n');
    }

    async _exec(warp10, params) {
        const payload = this._buildExecPayload(params);
        const resp = await warp10.exec(payload);
        return resp;
    }

    exec(...params) {
        return this._wrapCall(
            this._exec.bind(this),
            params,
        );
    }

    async _fetch(warp10, params) {
        const resp = await warp10.fetch(
            this._readToken,
            params.className,
            params.labels || {},
            params.start,
            params.stop,
            'json',
            false,
        );
        return resp;
    }

    fetch(...params) {
        return this._wrapCall(
            this._fetch.bind(this),
            params,
        );
    }
}

module.exports = {
    Warp10Client,
    client: new Warp10Client(_config.warp10),
};
