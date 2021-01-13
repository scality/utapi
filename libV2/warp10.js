const { Warp10 } = require('@senx/warp10');
const needle = require('needle');
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
        this._requestTimeout = (config && config.requestTimeout) || 10000;
        this._connectTimeout = (config && config.connectTimeout) || 10000;
        if (config && config.hosts) {
            this._clients = config.hosts
                .map(({ host, port }) => new Warp10(
                    `${proto}://${host}:${port}`,
                    this._requestTimeout,
                    this._connectTimeout,
                ));
        } else {
            const host = (config && config.host) || 'localhost';
            const port = (config && config.port) || 4802;
            this._clients = [new Warp10(`${proto}://${host}:${port}`, this._requestTimeout, this._connectTimeout)];
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

    async _update(warp10, payload) {
        return warp10.update(this._writeToken, payload);
    }

    async update(...params) {
        return this._wrapCall(
            this._update.bind(this),
            params,
        );
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

    async ingest(metadata, events) {
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
        const res = await this.update(payload);
        return res.count;
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

    async _delete(warp10, params) {
        const {
            className, labels, start, end,
        } = params;
        assert.notStrictEqual(className, undefined, 'you must provide a className');
        assert.notStrictEqual(className, start, 'you must provide a start timestamp');
        assert.notStrictEqual(className, end, 'you must provide a end timestamp');
        const query = new URLSearchParams([]);
        query.set('selector', encodeURIComponent(className) + this._clients[0].formatLabels(labels || {}));
        query.set('start', start.toString());
        query.set('end', end.toString());
        const response = await needle(
            'get',
            `${warp10.url}/api/v0/delete?${query.toString()}`,
            {
                // eslint-disable-next-line camelcase
                open_timeout: this._connectTimeout,
                // eslint-disable-next-line camelcase
                response_timeout: this._requestTimeout,
                headers: {
                    'Content-Type': 'text/plain; charset=UTF-8',
                    'X-Warp10-Token': this._writeToken,
                },
            },
        );
        return { result: response.body };
    }

    delete(...params) {
        return this._wrapCall(
            this._delete.bind(this),
            params,
        );
    }
}

module.exports = {
    Warp10Client,
    client: new Warp10Client(_config.warp10),
};
