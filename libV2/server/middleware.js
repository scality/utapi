const oasTools = require('oas-tools');
const path = require('path');
const { promisify } = require('util');
const config = require('../config');
const { logger, buildRequestLogger } = require('../utils');
const errors = require('../errors');

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

    if (err.failedValidation) { // failed request validation by oas-tools
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

module.exports = {
    initializeOasTools,
    middleware: {
        loggerMiddleware,
        errorMiddleware,
        responseLoggerMiddleware,
    },
};
