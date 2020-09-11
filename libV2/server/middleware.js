const oasTools = require('oas-tools');
const path = require('path');
const { promisify } = require('util');
const config = require('../config');
const { logger, buildRequestLogger } = require('../utils');
const errors = require('../errors');
const { authenticateRequest } = require('../vault');

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

function loggerMiddleware(req, res, next) {
    // eslint-disable-next-line no-param-reassign
    req.logger = buildRequestLogger(req);
    req.logger.info('Received request');
    return next();
}

// next is purposely not called as all error responses are handled here
// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
    let code = err.code || 500;
    let message = err.message || 'Internal Error';

    // failed request validation by oas-tools
    if (err.failedValidation) {
        // You can't actually use destructing here
        /* eslint-disable prefer-destructuring */
        code = errors.InvalidRequest.code;
        message = errors.InvalidRequest.message;
        /* eslint-enable prefer-destructuring */
    }

    if (!err.utapiError && !config.development) {
        // Make sure internal errors don't leak when not in development
        message = 'Internal Error';
    }

    res.status(code).send({
        error: {
            code: code.toString(),
            message,
        },
    });
}

function responseLoggerMiddleware(req, res, next) {
    const info = {
        httpCode: res.statusCode,
        httpMessage: res.statusMessage,
    };
    req.logger.end('finished handling request', info);
    return next();
}


async function initializeOasTools(spec, app) {
    oasTools.configure(oasOptions);
    return promisify(oasTools.initialize)(spec, app);
}

// eslint-disable-next-line no-unused-vars
async function authV4Middleware(request, response, params) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('AWS4-')) {
        request.logger.error('missing auth header for v4 auth');
        throw errors.InvalidRequest.customizeDescription('Must use Auth V4 for this request.');
    }

    let action;
    let level;
    let requestedResources = [];

    if (params.level) {
        // Can't destructure here
        // eslint-disable-next-line prefer-destructuring
        level = params.level;
        requestedResources = [params.resource];
        action = 'ListMetrics';
    } else {
        requestedResources = params.body[params.resource];
        level = params.resource;
        action = params.Action.value;
    }

    if (requestedResources.length === 0) {
        throw errors.InvalidRequest.customizeDescription('You must specify at lest one resource');
    }

    let passed;
    let authorizedResources;

    try {
        [passed, authorizedResources] = await authenticateRequest(request, action, level, requestedResources);
    } catch (error) {
        request.logger.error('error during authentication', { error });
        throw errors.InternalError;
    }

    if (!passed) {
        request.logger.trace('not authorized to access any requested resources');
        throw errors.AccessDenied;
    }

    if (params.level === undefined && authorizedResources !== undefined) {
        params.body[params.resource] = authorizedResources;
    }
}

module.exports = {
    initializeOasTools,
    middleware: {
        loggerMiddleware,
        errorMiddleware,
        responseLoggerMiddleware,
        authV4Middleware,
    },
};
