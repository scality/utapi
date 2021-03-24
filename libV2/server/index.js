const http = require('http');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const { ciphers, dhparam } = require('arsenal').https;

const SubSystem = require('../subsystem');

// const config = require('../config');
const { initializeOasTools, middleware } = require('./middleware');
const { spec: apiSpec } = require('./spec');
const { client: cacheClient } = require('../cache');
const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'server',
});

class UtapiServer extends SubSystem {
    constructor(config) {
        super();
        this._app = null;
        this._server = null;
        this._config = config;
    }

    static async _createApp(spec) {
        const app = express();
        app.use(bodyParser.json({ strict: false }));
        app.use(middleware.loggerMiddleware);
        await initializeOasTools(spec, app);
        app.use(middleware.errorMiddleware);
        app.use(middleware.responseLoggerMiddleware);
        return app;
    }

    _createHttpsAgent() {
        const conf = {
            ciphers: ciphers.ciphers,
            dhparam,
            cert: this._config.tls.cert,
            key: this._config.tls.key,
            ca: this._config.tls.ca ? [this._config.tls.ca] : null,
            requestCert: false,
            rejectUnauthorized: true,
        };
        const agent = new https.Agent(conf);
        conf.agent = agent;
        return conf;
    }

    async _createServer(app) {
        if (this._config.tls) {
            return https.createServer(UtapiServer._createHttpsAgent(), app);
        }
        return http.createServer(app);
    }

    async _startServer(server) {
        moduleLogger
            .with({
                method: 'UtapiServer::_startServer',
                cacheBackend: this._config.cacheBackend,
            })
            .info(`Server listening on ${this._config.port}`);
        await server.listen(this._config.port);
    }

    async _setup() {
        this._app = await UtapiServer._createApp(apiSpec);
        this._server = await this._createServer(this._app);
    }

    async _start() {
        await cacheClient.connect();
        await this._startServer(this._server);
    }

    async _join() {
        await this._server.close();
        await cacheClient.disconnect();
    }
}

async function startServer(conf) {
    const server = new UtapiServer(conf);
    try {
        await server.setup();
        await server.start();
    } catch (error) {
        moduleLogger
            .with({ method: 'UtapiServer::startServer' })
            .error('Unhandled Error!', { error: error.message });
        await server.join();
        throw error;
    }
}

module.exports = {
    UtapiServer,
    startServer,
};
