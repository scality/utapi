const { Warp10 } = require('@senx/warp10');
const needle = require('needle');
const assert = require('assert');
const { eventFieldsToWarp10, warp10EventType } = require('./constants');
const _config = require('./config');
const { LoggerContext } = require('./utils');

const moduleLogger = new LoggerContext({
    module: 'warp10',
});

class Warp10Client {
    constructor(config) {
        this._writeToken = (config && config.writeToken) || 'writeTokenStatic';
        this._readToken = (config && config.readToken) || 'readTokenStatic';
        this.nodeId = (config && config.nodeId) || _config.nodeId;
        const proto = (config && config.tls) ? 'https' : 'http';
        this._requestTimeout = (config && config.requestTimeout) || 30000;
        this._connectTimeout = (config && config.connectTimeout) || 30000;
        const host = (config && config.host) || 'localhost';
        const port = (config && config.port) || 4802;
        this._client = new Warp10(`${proto}://${host}:${port}`, this._requestTimeout, this._connectTimeout);
    }

    async update(payload) {
        return this._client.update(this._writeToken, payload);
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
        const _labels = this._client.formatLabels({ node: this.nodeId, ...labels });
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

    async exec(params) {
        const payload = this._buildExecPayload(params);
        const resp = await this._client.exec(payload);
        moduleLogger.info('warpscript executed', { stats: resp.meta });
        return resp;
    }

    async fetch(params) {
        const resp = await this._client.fetch(
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

    async delete(params) {
        const {
            className, labels, start, end,
        } = params;
        assert.notStrictEqual(className, undefined, 'you must provide a className');
        assert.notStrictEqual(start, undefined, 'you must provide a start timestamp');
        assert.notStrictEqual(end, undefined, 'you must provide a end timestamp');
        const query = new URLSearchParams([]);
        query.set('selector', encodeURIComponent(className) + this._client.formatLabels(labels || {}));
        query.set('start', start.toString());
        query.set('end', end.toString());
        const response = await needle(
            'get',
            `${this._client.url}/api/v0/delete?${query.toString()}`,
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
}

const clients = _config.warp10.hosts.map(
    val => new Warp10Client({
        readToken: _config.warp10.readToken,
        writeToken: _config.warp10.writeToken,
        ...val,
    }),
);

module.exports = {
    Warp10Client,
    clients,
};
