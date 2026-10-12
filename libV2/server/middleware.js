const path = require('path');
const OpenApiValidator = require('express-openapi-validator');
const { ipCheck } = require('@scality/arsenal');
const config = require('../config');
const { buildRequestLogger } = require('../utils');
const errors = require('../errors');
const { translateAndAuthorize } = require('../vault');
const metricHandlers = require('./metrics');

// Dispatch each operation to the `operationId` handler of the controller named by `x-router-controller`
function operationResolver(basePath, route, apiDoc) {
    const operation = apiDoc.paths[route.openApiRoute.substring(route.basePath.length)][route.method.toLowerCase()];
    const controller = require(path.join(basePath, operation['x-router-controller']));
    const handler = controller[operation.operationId];
    if (typeof handler !== 'function') {
        throw new Error(`no handler for operation ${operation['x-router-controller']}::${operation.operationId}`);
    }
    return handler;
}

async function initializeApi(spec, app) {
    app.get('/openapi.json', (req, res) => res.send(spec));
    app.use(OpenApiValidator.middleware({
        apiSpec: structuredClone(spec),
        // resolve $refs so handlers see the full parameter definitions in req.openapi
        $refParser: { mode: 'dereference' },
        validateRequests: {
            allowUnknownQueryParameters: true,
        },
        validateResponses: false,
        // undocumented routes and methods fall through to express' default 404
        ignoreUndocumented: true,
        operationHandlers: {
            basePath: path.join(__dirname, './API/'),
            resolver: operationResolver,
        },
    }));
}

function loggerMiddleware(req, res, next) {
    req.logger = buildRequestLogger(req);
    req.logger.info('Received request');
    return next();
}

function responseLoggerMiddleware(req, res, next) {
    const info = {
        httpCode: res.statusCode,
        httpMessage: res.statusMessage,
    };
    req.logger.end('finished handling request', info);
    if (next !== undefined) {
        next();
    }
}

function httpMetricsMiddleware(request, response, next) {
    // If the request.ctx is undefined then the request was not routed to an operation (/openapi.json, validation error)
    // No metrics should be pushed
    if (config.metrics.enabled && request.ctx && request.ctx.tag !== 'internal') {
        metricHandlers.httpRequestsTotal
            .labels({
                action: request.ctx.operationId,
                code: response.statusCode,
            }).inc(1);
        request.ctx.requestTimer({ code: response.statusCode });
    }

    if (next) {
        next();
    }
}

// next is purposely not called as all error responses are handled here
// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
    let statusCode = err.code || 500;
    let code = err.message || 'InternalError';
    let message = err.description || 'Internal Error';

    // failed request validation against the openapi spec (bad request, unsupported media type...)
    if (!err.utapiError && err.status >= 400 && err.status < 500) {
        // You can't actually use destructing here
        statusCode = errors.InvalidRequest.code;
        code = errors.InvalidRequest.message;
        message = errors.InvalidRequest.description;
    }

    if (!err.utapiError && !config.development) {
        // Make sure internal errors don't leak when not in development
        code = 'InternalError';
        message = 'Internal Error';
    }

    res.status(statusCode).send({
        code,
        message,
    });
    responseLoggerMiddleware(req, res, () => httpMetricsMiddleware(req, res));
}

async function authV4Middleware(request, response, params) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('AWS4-')) {
        request.logger.error('missing auth header for v4 auth');
        throw errors.InvalidRequest.customizeDescription('Must use Auth V4 for this request.');
    }

    let action = 'ListMetrics';
    let requestedResources = [];

    switch (request.ctx.operationId) {
    case 'listMetrics':
        requestedResources = params.body[params.level];
        action = params.Action;
        break;

    default:
        requestedResources = [params.resource];
        break;
    }

    if (requestedResources.length === 0) {
        throw errors.InvalidRequest.customizeDescription('You must specify at least one resource');
    }

    let passed;
    let authorizedResources;

    try {
        [passed, authorizedResources] = await translateAndAuthorize(request, action, params.level, requestedResources);
    } catch (error) {
        request.logger.error('error during authentication', { error });
        // rethrow any access denied errors
        if ((error.is && error.is.AccessDenied) || (error.utapiError && error.AccessDenied)) {
            throw error;
        }
        throw errors.InternalError;
    }

    if (!passed) {
        request.logger.trace('not authorized to access any requested resources');
        throw errors.AccessDenied;
    }

    switch (request.ctx.operationId) {
    case 'listMetrics':
        params.body[params.level] = authorizedResources;
        break;

    default:
        [params.resource] = authorizedResources;
        break;
    }
}

async function clientIpLimitMiddleware(request) {
    const allowIp = ipCheck.ipMatchCidrList(
        config.healthChecks.allowFrom, request.ip,
    );
    if (!allowIp) {
        throw errors.AccessDenied.customizeDescription('unauthorized origin ip on request');
    }
}

module.exports = {
    initializeApi,
    middleware: {
        loggerMiddleware,
        errorMiddleware,
        responseLoggerMiddleware,
        authV4Middleware,
        clientIpLimitMiddleware,
        httpMetricsMiddleware,
    },
};
