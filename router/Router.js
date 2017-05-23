const assert = require('assert');
const url = require('url');
const { auth, errors, policies } = require('arsenal');
const safeJsonParse = require('../utils/safeJsonParse');
const Vault = require('../lib/Vault');

class Router {

    /**
     * @constructor
     * @param {Config} config - Config instance
     */
    constructor(config) {
        this._service = config.component;
        this._routes = {};
        this._vault = new Vault(config);
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
        const { pathname, query } = url.parse(req.url, true);
        const resource = pathname.substring(1) || 'service';
        const reqData = {
            resource,
        };
        // assign query params
        Object.assign(reqData, query);
        req.on('data', data => body.push(data))
        .on('error', cb)
        .on('end', () => {
            const jsonParseRes = safeJsonParse(body.join(''));
            if (jsonParseRes.error) {
                return cb(errors.InvalidParameterValue);
            }
            return cb(null, Object.assign(reqData, jsonParseRes.result));
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
        utapiRequest.setStatusCode(route.getStatusCode());
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
        route.getHandler()(utapiRequest, this._service, (err, res) => {
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
        const log = utapiRequest.getLog();
        log.trace('checking input data validity', {
            method: 'Router._validateRoute',
        });
        const validator = route.getValidator()(data);
        const validationResult = validator.validate();
        if (!validationResult) {
            log.trace('input parameters are not well formated or missing', {
                method: 'Router._validateRoute',
            });
            return cb(validator.getValidationError());
        }
        utapiRequest.setValidator(validator);
        return this._processSecurityChecks(utapiRequest, route, cb);
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
            const { Action, Version, resource } = requestData;
            if (!Action) {
                log.trace('missing action parameter', {
                    method: 'Router.doRoute',
                });
                return cb(errors.InvalidAction);
            }
            if (!Version) {
                // version is optional
                log.trace('missing version parameter', {
                    method: 'Router.doRoute',
                });
            }
            if (!this._routes[req.method]) {
                log.trace('cannot find route with this method', {
                    method: 'Router.doRoute',
                    httpMethod: req.method,
                });
                return cb(errors.NotImplemented);
            }
            if (!this._routes[req.method][resource]) {
                log.trace('cannot find resource with this method', {
                    method: 'Router.doRoute',
                    httpMethod: req.method,
                    resource,
                });
                return cb(errors.NotImplemented);
            }
            const route = this._routes[req.method][resource][Action];
            if (!route) {
                log.trace('cannot find route for this Action under this ' +
                    'http method', {
                        method: 'Router.doRoute',
                        httpMethod: req.method,
                        resource,
                        Action: requestData.Action,
                    });
                return cb(errors.NotImplemented);
            }
            utapiRequest.setRoute(route);
            return this._validateRoute(utapiRequest, route, requestData, cb);
        });
    }

    /**
     * Send authentication and authorization request to vault
     * @param {UtapiRequest} utapiRequest - Utapi request object
     * @param {function} cb - Callback (err)
     * @return {undefined}
     */
    _authSquared(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        const authHeader = utapiRequest.getRequestHeaders().authorization;
        if (!authHeader || !authHeader.startsWith('AWS4')) {
            log.trace('missing auth header for v4 auth');
            return cb(errors.InvalidRequest.customizeDescription('Must ' +
                'use Auth V4 for this request.'));
        }
        // resourceType will either be "buckets", "accounts" or "users"
        const resourceType = utapiRequest.getResource();
        const validator = utapiRequest.getValidator();
        // specific resources will be names of buckets, accounts or users
        const specificResources = validator.get(resourceType);

        const requestContexts = specificResources.map(specificResource =>
            new policies.RequestContext(utapiRequest.getRequestHeaders(),
            utapiRequest.getRequestQuery(), resourceType, specificResource,
            utapiRequest.getRequesterIp(), utapiRequest.getSslEnabled(),
            utapiRequest.getAction(), 'utapi')
        );
        auth.setHandler(this._vault);
        const request = utapiRequest.getRequest();
        request.path = utapiRequest.getRequestPathname();
        request.query = utapiRequest.getRequestQuery();
        return auth.server.doAuth(request, log, (err, authResults) => {
            if (err) {
                return cb(err);
            }
            // Will only have authorizationResults if request is from a user
            // rather than an account
            if (authResults) {
                const authorizedResources = [];
                authResults.forEach(result => {
                    if (result.isAllowed) {
                        assert(typeof result.arn === 'string');
                        assert(result.arn.indexOf('/') > -1);
                        // result.arn should be of format:
                        // arn:scality:utapi:::resourcetype/resource
                        const resource = result.arn.split('/')[1];
                        authorizedResources.push(resource);
                        log.trace('access granted for resource', { resource });
                    }
                });
                if (authorizedResources.length === 0) {
                    log.trace('not authorized to access any requested ' +
                    'resources');
                    return cb(errors.AccessDenied);
                }
                // Change list of resources to those that are authorized
                validator.set(resourceType, authorizedResources);
            }
            log.trace('passed security checks');
            return cb();
        },
        's3', requestContexts);
    }

    /**
     * Process security checks
     * @param {UtapiRequest} utapiRequest - Utapi request object
     * @param {Route} route - Route information object
     * @param {function} cb - Callback (err, result)
     * @return {undefined}
     */
    _processSecurityChecks(utapiRequest, route, cb) {
        const log = utapiRequest.getLog();
        return this._authSquared(utapiRequest, err => {
            if (err) {
                log.trace('error from vault', { errors: err });
                return cb(err);
            }
            return this._startRequest(utapiRequest, route, cb);
        });
    }

}

module.exports = Router;
