const oasTools = require('oas-tools');
const path = require('path');
const { promisify } = require('util');
const { ipCheck } = require('arsenal');
const config = require('../config');
const { logger, buildRequestLogger } = require('../utils');
const errors = require('../errors');
const { translateAndAuthorize } = require('../vault');

const oasOptions = {
    controllers: path.join(__dirname, './API/'),
    checkControllers: true,
    loglevel: config.logging.level === 'trace' ? 'debug' : 'info', // oasTools is very verbose
    customLogger: logger,
    customErrorHandling: true,
    strict: true,
    router: true,
    validator: true,
    docs: {
        apiDocs: '/openapi.json',
        apiDocsPrefix: '',
    },
    ignoreUnknownFormats: true,
};

// If in development mode, enable the swagger ui
if (config.development) {
    oasOptions.docs = {
        swaggerUi: '/_/docs',
        swaggerUiPrefix: '',
        ...oasOptions.docs,
    };
}

async function initializeOasTools(spec, app) {
    oasTools.configure(oasOptions);
    return promisify(oasTools.initialize)(spec, app);
}

function loggerMiddleware(req, res, next) {
    // eslint-disable-next-line no-param-reassign
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

// next is purposely not called as all error responses are handled here
// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
    let statusCode = err.code || 500;
    let code = err.message || 'InternalError';
    let message = err.description || 'Internal Error';

    // failed request validation by oas-tools
    if (err.failedValidation) {
        // You can't actually use destructing here
        /* eslint-disable prefer-destructuring */
        statusCode = errors.InvalidRequest.code;
        code = errors.InvalidRequest.message;
        message = errors.InvalidRequest.description;
        /* eslint-enable prefer-destructuring */
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
    responseLoggerMiddleware(req, res);
}

// eslint-disable-next-line no-unused-vars
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
        if (error.AccessDenied) {
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
    initializeOasTools,
    middleware: {
        loggerMiddleware,
        errorMiddleware,
        responseLoggerMiddleware,
        authV4Middleware,
        clientIpLimitMiddleware,
    },
};
