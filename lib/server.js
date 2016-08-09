import http from 'http';
import https from 'https';
import { Clustering, https as arsenal } from 'arsenal';

import logger from '../utils/logger';
import _config from './Config';
import routes from '../router/routes';
import Route from '../router/Route';
import Router from '../router/Router';
import UtapiRequest from '../lib/UtapiRequest';

class UtapiServer {
    /**
     * This represents UtapiServer
     * @constructor
     * @param {Worker} [worker=null] - Track the worker when using cluster
     */
    constructor(worker) {
        this.worker = worker;

        this.router = new Router();
        // setup routes
        routes.forEach(item => this.router.addRoute(new Route(item)));
    }

    requestListener(req, res, router) {
        // disable nagle algorithm
        req.socket.setNoDelay();
        const utapiRequest = new UtapiRequest()
            .setRequest(req)
            .setLog(logger.newRequestLogger())
            .setResponse(res);
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
        if (_config.https) {
            this.server = https.createServer({
                cert: _config.https.cert,
                key: _config.https.key,
                ca: _config.https.ca,
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
                port: _config.port,
            };
            logger.info('server started', {
                address: addr.address,
                port: addr.port,
                pid: process.pid,
                https: _config.https === true,
            });
        });
        this.server.listen(_config.port);
    }

    /*
     * This exits the running process properly.
     */
    cleanUp() {
        logger.info('server shutting down');
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
* @return {undefined}
*/
export default function spawn() {
    const workers = _config.workers || 1;
    const cluster = new Clustering(workers, logger);
    cluster.start(current => {
        const server = new UtapiServer(current);
        server.startup();
    });
}
