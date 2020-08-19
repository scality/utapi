const path = require('path');
const { promisify } = require('util');
const Joi = require('@hapi/joi');
const oasTools = require('oas-tools');
const werelogs = require('werelogs');
const config = require('../config');
const { legacyApiVersion, currentApiVersion } = require('../constants');
const errors = require('../errors');
const { buildRequestLogger } = require('../utils');
const { authenticateRequest } = require('../vault');
const LegacyServer = require('./legacy');

const oasLogger = new werelogs.Werelogs({
    level: config.logging.level === 'trace' ? 'debug' : 'info', // oasTools is very verbose
    dump: config.logging.dumpLevel,
});

const oasOptions = {
    controllers: path.join(__dirname, './API/'),
    checkControllers: true,
    customLogger: new oasLogger.Logger('Utapi'),
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


function responseLoggerMiddleware(req, res, next) {
    const info = {
        httpCode: res.statusCode,
        httpMessage: res.statusMessage,
    };
    req.logger.end('finished handling request', info);
    if (next) {
        next();
    }
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
    responseLoggerMiddleware(req, {
        statusCode: code,
        statusMessage: message,
    });
}
const _versionFormat = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
function apiVersionMiddleware(request, response, next) {
    const apiVersion = request.query.Version;
    if (!apiVersion) {
        request.logger.debug('no api version specified, assuming latest');
        next();
        return;
    }

    try {
        Joi.assert(apiVersion, _versionFormat);
    } catch (err) {
        request.logger.error('malformed Version parameter', { apiVersion });
        next(errors.InvalidQueryParameter
            .customizeDescription('The Version query parameter is malformed.'));
        return;
    }

    if (apiVersion === legacyApiVersion) {
        request.logger.debug('legacy api version specified routing to v1');
        LegacyServer.handleRequest(request, response, err => {
            if (err) {
                return next(err);
            }
            responseLoggerMiddleware(request, response);
            // next is purposefully not called as LegacyServer handles its own response
        });
        return;
    }

    if (apiVersion === currentApiVersion) {
        request.logger.debug('latest api version specified routing to v2');
        next();
        return;
    }

    next(errors.InvalidQueryParameter
        .customizeDescription('Invalid value for Version'));
}


async function initializeOasTools(spec, app) {
    oasTools.configure(oasOptions);
    return promisify(oasTools.initialize)(spec, app);
}

// eslint-disable-next-line no-unused-vars
async function authV4Middleware(request, response, params) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('AWS4-')) {
        request.log.error('missing auth header for v4 auth');
        throw errors.InvalidRequest.customizeDescription('Must use Auth V4 for this request.');
    }

    let passed;
    let authorizedResources;

    try {
        [passed, authorizedResources] = await authenticateRequest(request, params);
    } catch (error) {
        request.logger.error('error during authentication', { error });
        throw errors.InternalError;
    }

    if (!passed) {
        request.logger.trace('not authorized to access any requested resources');
        throw errors.AccessDenied;
    }

    if (authorizedResources !== undefined) {
        params.body[params.resource.value] = authorizedResources;
    }
}

module.exports = {
    initializeOasTools,
    middleware: {
        loggerMiddleware,
        errorMiddleware,
        responseLoggerMiddleware,
        authV4Middleware,
        apiVersionMiddleware,
    },
};
