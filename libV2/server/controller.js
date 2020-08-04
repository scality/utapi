/* eslint-disable no-param-reassign */
const { apiOperations, apiOperationMiddleware } = require('./spec');
const { middleware: utapiMiddleware } = require('./middleware');
const RequestContext = require('../models/RequestContext');
const errors = require('../errors');
const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'server.controller',
});

/**
 * ApiController
 * @param {string} tag - Controller tag to load, should match `x-router-controller` from openapi spec
 * @returns {undefined}
 */

class APIController {
    constructor(tag) {
        this._handlers = APIController._collectHandlers(tag);
        this._middleware = APIController._collectHandlerMiddleware(tag);
    }

    static _safeRequire(path) {
        try {
            // eslint-disable-next-line import/no-dynamic-require, global-require
            return require(path);
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') {
                moduleLogger
                    .with({ method: 'APIController::_safeRequire' })
                    .error(`error while loading handler from ${path}`);
                throw error;
            }
            return null;
        }
    }

    static _notImplementedHandler(tag, operationId) {
        // eslint-disable-next-line no-unused-vars
        return async (ctx, params) => {
            throw errors.NotImplemented.customizeDescription(
                `the operation "${tag}::${operationId}" has not been implemented`,
            );
        };
    }

    static _getOperationHandler(tag, operationId) {
        const op = APIController._safeRequire(`./API/${tag}/${operationId}`);
        if (op === null) {
            moduleLogger
                .with({ method: 'APIController::_getOperationHandler' })
                .error(`no handler for ${tag}:${operationId} found, using notImplemented handler`);
            return APIController._notImplementedHandler(tag, operationId);
        }
        return op;
    }

    static _collectHandlers(tag) {
        return Array.from(apiOperations[tag]).reduce((handlers, id) => {
            handlers[id] = APIController._getOperationHandler(tag, id);
            return handlers;
        }, {});
    }

    static _collectHandlerMiddleware(tag) {
        return Object.entries(apiOperationMiddleware[tag])
            .reduce((handlers, [id, handler]) => {
                const middleware = [];
                if (handler.authv4) {
                    middleware.push(utapiMiddleware.authV4Middleware);
                }
                handlers[id] = middleware;
                return handlers;
            }, {});
    }

    static _extractParams(req) {
        return Object.entries(req.swagger.params)
            .reduce((params, [key, value]) => {
                params[key] = value.value;
                return params;
            }, {});
    }

    static async _writeResult(results, response) {
        // If no results have been set return a 500
        // console.log(results.getValue())
        if (
            !results.hasRedirect()
            && !results.hasBody()
            && !results.hasStatusCode()
        ) {
            throw errors.InternalError;
        }
        // If we have a redirect, do it
        if (results.hasRedirect()) {
            response.redirect(results.redirect);
        // If we have both a body & status, send both
        } else if (results.hasBody() && results.hasStatusCode()) {
            response.status(results.statusCode).send(results.body);
        // If all we have is a status code, then send it with an empty body
        } else if (results.hasStatusCode() && !results.hasBody()) {
            response.sendStatus(results.statusCode);
        // If no status code is set, but we have a body, assume `200` and send
        } else if (results.hasBody() && !results.hasStatusCode()) {
            response.status(200).send(results.body);
        }
    }

    static _buildRequestContext(req) {
        return new RequestContext(req);
    }

    /**
     * callOperation
     *
     * Constructs the request context, extracts operation parameters, calls the
     * operation handler, and writes its result.
     *
     * @param {function} handler - Function returning a Promise implementing the operation
     * @param {Request} request - Express request object
     * @param {Response} response - Express response object
     * @param {Object} params - Extracted request parameters
     * @returns {undefined} -
     */
    static async _callOperation(handler, request, response, params) {
        try {
            await handler(request.ctx, params);
        } catch (err) {
            request.logger.error('error during operation', { err });
            throw err;
        }
        request.logger.debug('writing operation result');
        try {
            await APIController._writeResult(request.ctx.results, response);
        } catch (err) {
            request.logger.error(
                'error while writing operation result',
                { err },
            );
            throw err;
        }
    }

    static async _callMiddleware(middleware, request, response, params) {
        await middleware.reduce(
            (chain, mw) => (chain
                ? chain.then(() => mw(request, response, params))
                : mw(request, response, params)),
            null,
        );
    }

    static callOperation(operationId, handler, middleware, request, response, done) {
        request.ctx = APIController._buildRequestContext(request);
        const requestParams = APIController._extractParams(request);
        request.logger.debug(`calling middleware for ${operationId}`);
        APIController._callMiddleware(middleware, request, response, requestParams)
            .then(() => {
                request.logger.debug(`calling operation ${operationId}`);
                return APIController._callOperation(handler, request, response, requestParams);
            })
            .then(
                done,
                done,
            );
    }

    /**
     * buildMap
     *
     * Constructs an object of `operationId`|`callOperation` pairs for use as a controller with oas-tools
     * @returns {Object} - Map of operationIds to handler
     */
    buildMap() {
        return Object.entries(this._handlers)
            .reduce((ops, [id, handler]) => {
                ops[id] = (request, response, done) =>
                    APIController.callOperation(id, handler, this._middleware[id], request, response, done);
                return ops;
            }, {});
    }
}

module.exports = APIController;
