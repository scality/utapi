const http = require('http');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const { ciphers, dhparam } = require('arsenal').https;

const Process = require('../process');
const config = require('../config');
const { initializeOasTools, middleware } = require('./middleware');
const { spec: apiSpec } = require('./spec');
const { client: cacheClient } = require('../cache');
const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'server',
});

class UtapiServer extends Process {
    constructor() {
        super();
        this._app = null;
        this._server = null;
    }

    static async _createApp(spec) {
        const app = express();
        app.use(bodyParser.json({ strict: false }));
        app.use(middleware.loggerMiddleware);
        await initializeOasTools(spec, app);
        app.use(middleware.errorMiddleware);
        app.use(middleware.httpMetricsMiddleware);
        app.use(middleware.responseLoggerMiddleware);
        return app;
    }

    static _createHttpsAgent() {
        const conf = {
            ciphers: ciphers.ciphers,
            dhparam: dhparam.dhparam,
            cert: config.tls.cert,
            key: config.tls.key,
            ca: config.tls.ca ? [config.tls.ca] : null,
            requestCert: false,
            rejectUnauthorized: true,
        };
        const agent = new https.Agent(conf);
        conf.agent = agent;
        return conf;
    }

    static async _createServer(app) {
        if (config.tls) {
            return https.createServer(UtapiServer._createHttpsAgent(), app);
        }
        return http.createServer(app);
    }

    static async _startServer(server) {
        moduleLogger
            .with({
                method: 'UtapiServer::_startServer',
                cacheBackend: config.cacheBackend,
            })
            .info(`Server listening on ${config.port}`);
        await server.listen(config.port);
    }

    async _setup() {
        this._app = await UtapiServer._createApp(apiSpec);
        this._server = await UtapiServer._createServer(this._app);
    }

    async _start() {
        await cacheClient.connect();
        await UtapiServer._startServer(this._server);
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
