import http from 'http';
import https from 'https';
import url from 'url';

import { Clustering, https as arsenal } from 'arsenal';
import { Logger } from 'werelogs';

import Config from './Config';
import routes from '../router/routes';
import Route from '../router/Route';
import Router from '../router/Router';
import UtapiRequest from '../lib/UtapiRequest';
import Datastore from './Datastore';
import redisClient from '../utils/redisClient';

class UtapiServer {
    /**
     * This represents UtapiServer
     * @constructor
     * @param {Worker} [worker=null] - Track the worker when using cluster
     * @param {number} port - server port
     * @param {Datasore} datastore - DataStore instance
     * @param {Werelogs} logger - Werelogs logger instance
     */
    constructor(worker, port, datastore, logger) {
        this.worker = worker;
        this.port = port;
        this.router = new Router();
        this.logger = logger;
        this.datastore = datastore;
        this.server = null;
        // setup routes
        routes.forEach(item => this.router.addRoute(new Route(item)));
    }

    requestListener(req, res, router) {
        // disable nagle algorithm
        req.socket.setNoDelay();
        const { query, path } = url.parse(req.url, true);
        const utapiRequest = new UtapiRequest()
            .setRequest(req)
            .setLog(this.logger.newRequestLogger())
            .setResponse(res)
            .setDatastore(this.datastore)
            .setRequestQuery(query)
            .setRequestPath(path);
        router.doRoute(utapiRequest, (err, data) => {
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
        if (Config.https) {
            this.server = https.createServer({
                cert: Config.https.cert,
                key: Config.https.key,
                ca: Config.https.ca,
                ciphers: arsenal.https.ciphers.ciphers,
                dhparam: arsenal.https.dhparam.dhparam,
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
                https: Config.https === true,
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
        const payload = new Buffer(JSON.stringify(data));
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
export default function spawn(params) {
    let redis;
    let workers;
    let log;
    let port;
    if (params && params.redis) {
        redis = params.redis;
    } else {
        redis = Config.redis;
    }
    if (params && params.workers) {
        workers = params.workers;
    } else {
        workers = Config.workers;
    }
    if (params && params.log) {
        log = params.log;
    } else {
        log = Config.log;
    }
    if (params && params.port) {
        port = params.port;
    } else {
        port = Config.port;
    }
    const logger = new Logger('Utapi', { level: log.logLevel,
        dump: log.dumpLevel });
    const cluster = new Clustering(workers, logger);
    cluster.start(worker => {
        const datastore = new Datastore().setClient(redisClient(redis, logger));
        const server = new UtapiServer(worker, port, datastore, logger);
        server.startup();
    });
}
