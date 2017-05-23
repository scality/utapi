const http = require('http');
const https = require('https');
const url = require('url');

const { Clustering, errors, ipCheck } = require('arsenal');
const arsenalHttps = require('arsenal').https;
const { Logger } = require('werelogs');

const config = require('./Config');
const routes = require('../router/routes');
const Route = require('../router/Route');
const Router = require('../router/Router');
const UtapiRequest = require('../lib/UtapiRequest');
const Datastore = require('./Datastore');
const redisClient = require('../utils/redisClient');

class UtapiServer {
    /**
     * This represents UtapiServer
     * @constructor
     * @param {Worker} [worker=null] - Track the worker when using cluster
     * @param {number} port - server port
     * @param {Datasore} datastore - DataStore instance
     * @param {Werelogs} logger - Werelogs logger instance
     * @param {Config} config - Config instance
     */
    constructor(worker, port, datastore, logger, config) {
        this.worker = worker;
        this.port = port;
        this.router = new Router(config);
        this.logger = logger;
        this.datastore = datastore;
        this.server = null;
        // setup routes
        routes.forEach(item => this.router.addRoute(new Route(item)));
    }

    /**
     * Function to validate a URI component
     *
     * @param {string|object} component - path from url.parse of request.url
     * (pathname plus query) or query from request
     * @return {string|undefined} If `decodeURIComponent` throws an error,
     * return the invalid `decodeURIComponent` string, otherwise return
     * `undefined`
     */
    _checkURIComponent(component) {
        if (typeof component === 'string') {
            try {
                decodeURIComponent(component);
            } catch (err) {
                return true;
            }
        } else {
            return Object.keys(component).find(x => {
                try {
                    decodeURIComponent(x);
                    decodeURIComponent(component[x]);
                } catch (err) {
                    return true;
                }
                return false;
            });
        }
        return undefined;
    }

    requestListener(req, res, router) {
        // disable nagle algorithm
        req.socket.setNoDelay();
        const { query, path, pathname } = url.parse(req.url, true);
        const utapiRequest = new UtapiRequest()
            .setRequest(req)
            .setLog(this.logger.newRequestLogger())
            .setResponse(res)
            .setDatastore(this.datastore);
        // Sanity check for valid URI component
        if (this._checkURIComponent(query) || this._checkURIComponent(path)) {
            return this.errorResponse(utapiRequest, errors.InvalidURI);
        }
        utapiRequest.setRequestQuery(query);
        utapiRequest.setRequestPath(path);
        utapiRequest.setRequestPathname(pathname);
        // temp hack: healthcheck route
        if (path === '/_/healthcheck' && (req.method === 'GET'
            || req.method === 'POST')) {
            utapiRequest.setStatusCode(200);
            const allowIp = ipCheck.ipMatchCidrList(
                config.healthChecks.allowFrom, req.socket.remoteAddress);
            if (!allowIp) {
                return this.errorResponse(utapiRequest, errors.AccessDenied);
            }
            const redisClient = this.datastore.getClient();
            if (redisClient.status !== 'ready') {
                return this.errorResponse(utapiRequest,
                        errors.InternalError.customizeDescription(
                            'Redis server is not ready'));
            }
            return this.response(utapiRequest, {});
        }
        return router.doRoute(utapiRequest, (err, data) => {
            if (err) {
                return this.errorResponse(utapiRequest, err);
            }
            return this.response(utapiRequest, data);
        });
    }

    /*
     * This starts the http server.
     */
    startup() {
        if (config.https) {
            const { cert, key, ca } = config.https;
            this.server = https.createServer({
                cert,
                key,
                ca,
                ciphers: arsenalHttps.ciphers.ciphers,
                dhparam: arsenalHttps.dhparam.dhparam,
                rejectUnauthorized: true,
            }, (req, res) => this.requestListener(req, res, this.router));
        } else {
            this.server = http.createServer((req, res) =>
                this.requestListener(req, res, this.router));
        }
        this.server.on('listening', () => {
            const addr = this.server.address() || {
                address: '0.0.0.0',
                port: this.port,
            };
            this.logger.trace('server started', {
                address: addr.address,
                port: addr.port,
                pid: process.pid,
                https: config.https === true,
            });
        });
        this.server.listen(this.port);
    }

    /*
     * This exits the running process properly.
     */
    cleanUp() {
        this.logger.info('server shutting down');
        this.server.close();
        process.exit(0);
    }

    static logRequestEnd(logger, req, res) {
        const info = {
            clientIp: req.socket.remoteAddress,
            clientPort: req.socket.remotePort,
            httpMethod: req.method,
            httpURL: req.url,
            httpCode: res.statusCode,
            httpMessage: res.statusMessage,
        };
        logger.end('finished handling request', info);
    }

    /**
     * Server's response to the client
     * @param {UtapiRequest} utapiRequest - UtapiRequest instance
     * @param {Object} data - JSON response to the client
     * @return {Object} res - response object
     */
    response(utapiRequest, data) {
        const log = utapiRequest.getLog();
        const req = utapiRequest.getRequest();
        const res = utapiRequest.getResponse();
        log.trace('writing HTTP response', {
            method: 'UtapiServer.resoponse',
        });
        const code = utapiRequest.getStatusCode();
        /*
        * Encoding data to binary provides a hot path to write data
        * directly to the socket, without node.js trying to encode the data
        * over and over again.
        */
        const payload = Buffer.from(JSON.stringify(data), 'utf8');
        res.writeHead(code, {
            'server': 'ScalityS3',
            'x-scal-request-id': log.getSerializedUids(),
            'content-type': 'application/json',
            'content-length': payload.length,
        });
        res.write(payload);
        UtapiServer.logRequestEnd(log, req, res);
        return res.end();
    }

    /**
     * Respond to the request with the error details
     * @param {UtapiRequest} utapiRequest - UtapiRequest instance
     * @param {ArsenalError} err - Arsenal error instance
     * @return {Object} res - response object
     */
    errorResponse(utapiRequest, err) {
        utapiRequest.setStatusCode(err.code);
        return this.response(utapiRequest,
            { code: err.message, message: err.description });
    }
}

/**
* Spawns a new server
* @param {object} [params] - configuration params (optional)
* @property {object} params.redis - redis configuration
* @property {number} params.workers - number of workers for Cluster
* @property {object} params.log - logger configuration
* @return {undefined}
*/
function spawn(params) {
    Object.assign(config, params);
    const { workers, redis, log, port } = config;

    const logger = new Logger('Utapi', { level: log.logLevel,
        dump: log.dumpLevel });
    const cluster = new Clustering(workers, logger);
    cluster.start(worker => {
        const datastore = new Datastore().setClient(redisClient(redis, logger));
        const server = new UtapiServer(worker, port, datastore, logger, config);
        server.startup();
    });
}

module.exports = spawn;
