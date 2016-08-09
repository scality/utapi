import { errors } from 'arsenal';
import safeJsonParse from '../utils/safeJsonParse';

class Router {

    /**
     * @constructor
     */
    constructor() {
        this._routes = {};
    }

    /**
     * Add a new route
     * @param {Route} route - Route information object
     * @return {undefined}
     */
    addRoute(route) {
        const method = route.getMethod();
        const resource = route.getResource();
        const action = route.getAction();
        if (!this._routes[method]) {
            this._routes[method] = {};
        }
        if (!this._routes[method][resource]) {
            this._routes[method][resource] = {};
        }
        this._routes[method][resource][action] = route;
    }

    /**
     * Extract request data from POST body
     * @param {http.Request} req - Http request object
     * @param {function} cb - Callback (err, result)
     * @return {undefined}
     */
    static extractRequestData(req, cb) {
        const body = [];
        req.on('data', data => body.push(data))
        .on('error', cb)
        .on('end', () => {
            const jsonParseRes = safeJsonParse(body.join(''));
            if (jsonParseRes.error) {
                return cb(errors.InvalidParameterValue);
            }
            return cb(null, jsonParseRes.result);
        });
    }

    /**
     * Finalize the request, return response to client
     * @param {UtapiRequest} utapiRequest - Utapi request object
     * @param {Route} route - Route information object
     * @param {object} res - Data to format for the client
     * @param {function} cb - Callback(err, result)
     * @return {undefined}
     */
    _finalizeRequest(utapiRequest, route, res, cb) {
        // const log = utapiRequest.getLog();
        utapiRequest.setStatusCode(route.getCode());
        return route.getResponseBuilder()(utapiRequest, res, cb);
    }

    /**
     * Pass the request to route handler
     * @param {UtapiRequest} utapiRequest - Utapi request object
     * @param {Route} route - Route information object
     * @param {funtion} cb - Callback(err, result)
     * @return {undefined}
     */
    _startRequest(utapiRequest, route, cb) {
        const log = utapiRequest.getLog();
        log.trace('call handler of the request', {
            method: 'Router._startRequest',
        });
        route.getHandler()(utapiRequest, (err, res) => {
            if (err) {
                log.trace('handler returns an error', {
                    method: 'Router._startRequest',
                    error: err,
                });
                return cb(err);
            }
            return this._finalizeRequest(utapiRequest, route, res, cb);
        });
    }

    /**
     * Validate route data, by using the validator associated
     * to the route
     * @param {UtapiRequest} utapiRequest - Utapi request object
     * @param {Route} route - Route information object
     * @param {object} data - Data from request to validate
     * @param {function} cb - Callback (err, result)
     * @return {undefined}
     */
    _validateRoute(utapiRequest, route, data, cb) {
        // TODO: perform validation
        return this._startRequest(utapiRequest, route, cb);
    }

    /**
     * Routes the request to its handler
     * @param {UtapiRequest} utapiRequest - UtapiRequest instance
     * @param {function} cb - Callback(err, result)
     * @return {undefined}
     */
    doRoute(utapiRequest, cb) {
        const req = utapiRequest.getRequest();
        const log = utapiRequest.getLog();
        Router.extractRequestData(req, (err, requestData) => {
            log.info('request received', {
                method: 'Router.doRoute',
                httpMethod: req.method,
                url: req.url,
                requestData,
            });
            if (err) {
                log.trace('cannot extract data from request');
                return cb(err);
            }
            if (!requestData) {
                return cb(errors.InvalidParameterValue);
            }
            if (!requestData.Action) {
                log.trace('missing action parameter', {
                    method: 'Router.doRoute',
                });
                return cb(errors.InvalidAction);
            }
            if (!this._routes[req.method]) {
                log.trace('cannot find route with this method', {
                    method: 'Router.doRoute',
                });
                return cb(errors.NotImplemented);
            }
            const route = this._routes[req.method][requestData.Action];
            if (!route) {
                log.trace('cannot find route for this Action under this ' +
                    'http method', {
                        method: 'Router.doRoute',
                        Action: requestData.Action,
                        httpMethod: req.method,
                    });
                return cb(errors.NotImplemented);
            }
            utapiRequest.setRoute(route);
            return this._processSecurityChecks(utapiRequest, route,
                requestData, cb);
        });
    }

    /**
     * Process security checks according to the route
     * @param {UtapiRequest} utapiRequest - Utapi request object
     * @param {Route} route - Route information object
     * @param {object} requestData - data from the request
     * @param {function} cb - Callback (err, result)
     * @return {undefined}
     */
    _processSecurityChecks(utapiRequest, route, requestData, cb) {
        // TODO: auth v4 and authorization with policies
        return this._validateRoute(utapiRequest, route, requestData, cb);
    }

}

module.exports = Router;
