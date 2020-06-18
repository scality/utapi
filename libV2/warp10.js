const { Warp10 } = require('@senx/warp10/dist');
const { eventFieldsToWarp10, warp10ValueType } = require('./constants');

class Warp10Client {
    constructor(config) {
        this._writeToken = (config && config.token) || 'writeTokenCI';
        this._readToken = (config && config.token) || 'readTokenCI';
        const proto = (config && config.tls) ? 'https' : 'http';
        const host = (config && config.host) || 'localhost';
        const port = (config && config.port) || 4802;
        this._warp10 = new Warp10(`${proto}://${host}:${port}`);
    }

    static _packEvent(event) {
        const packed = Object.entries(event.getValue())
            .filter(([key]) => eventFieldsToWarp10[key])
            .map(([key, value]) => `"${eventFieldsToWarp10[key]}" ${JSON.stringify(value)}`)
            .join(' ');
        return `${warp10ValueType}:{ ${packed} }`;
    }

    static _buildGTSEntry(className, event) {
        return {
            className,
            timestamp: event.timestamp,
            labels: event.labels || [],
            value: Warp10Client._packEvent(event),
        };
    }

    async ingest(className, events) {
        const payload = events.map(ev => Warp10Client._buildGTSEntry(className, ev));
        const res = await this._warp10.update(this._writeToken, payload);
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
        const resp = await this._warp10.exec(payload);
        return resp;
    }

    async fetch(params) {
        const resp = await this._warp10.fetch(
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
}

module.exports = Warp10Client;
