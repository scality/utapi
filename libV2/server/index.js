const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const Process = require('../process');
const config = require('../config');
const { initializeOasTools, middleware } = require('./middleware');
const { spec: apiSpec } = require('./spec');
const { client: cacheClient } = require('../cache');
const { LoggerContext } = require('../utils');
const LegacyServer = require('./legacy');

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
        app.use(middleware.apiVersionMiddleware);
        await initializeOasTools(spec, app);
        app.use(middleware.errorMiddleware);
        app.use(middleware.responseLoggerMiddleware);
        return app;
    }

    static async _createServer(app) {
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
        LegacyServer.setup();
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
