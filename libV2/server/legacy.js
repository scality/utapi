const url = require('url');

const config = require('../config');
const errors = require('../errors');
const routes = require('../../router/routes');
const Route = require('../../router/Route');
const Router = require('../../router/Router');
const redisClient = require('../../utils/redisClient');
const UtapiRequest = require('../../lib/UtapiRequest');
const Datastore = require('../../lib/Datastore');

const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'server.legacy',
});


/**
 * Function to validate a URI component
 *
 * @param {string|object} component - path from url.parse of request.url
 * (pathname plus query) or query from request
 * @return {string|undefined} If `decodeURIComponent` throws an error,
 * return the invalid `decodeURIComponent` string, otherwise return
 * `undefined`
 */
function _checkURIComponent(component) {
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

class LegacyServer {
    constructor() {
        this.router = null;
        this.datastore = null;
    }

    setup() {
        this.router = new Router(config);
        routes.forEach(item => this.router.addRoute(new Route(item)));

        const logger = moduleLogger.with({ component: 'redis' });
        this.datastore = new Datastore().setClient(redisClient(config.redis, logger));
    }

    handleRequest(req, res, next) {
        const { query, path, pathname } = url.parse(req.url, true);

        // Sanity check for valid URI component
        if (_checkURIComponent(query) || _checkURIComponent(path)) {
            return next(errors.InvalidURI);
        }

        const utapiRequest = new UtapiRequest()
            .setRequest(req)
            .setLog(req.logger)
            .setResponse(res)
            .setDatastore(this.datastore)
            .setRequestQuery(query)
            .setRequestPath(path)
            .setRequestPathname(pathname);

        return this.router.doRoute(utapiRequest, (err, data) => {
            if (err) {
                // eslint-disable-next-line no-param-reassign
                err.utapiError = true; // Make sure this error is returned as-is
                next(err);
                return;
            }

            const log = utapiRequest.getLog();
            const res = utapiRequest.getResponse();
            req.logger.trace('writing HTTP response', {
                method: 'UtapiServer.response',
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
            res.end();
            next();
        });
    }
}


module.exports = new LegacyServer();
