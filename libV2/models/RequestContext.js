const Joi = require('@hapi/joi');

const { buildModel } = require('./Base');
const { apiOperations } = require('../server/spec');
const ResponseContainer = require('./ResponseContainer');
const { httpRequestDurationSeconds } = require('../server/metrics');

const apiTags = Object.keys(apiOperations);
const apiOperationIds = Object.values(apiOperations)
    .reduce((ids, ops) => {
        ops.forEach(id => ids.add(id));
        return ids;
    }, new Set());

const contextSchema = {
    host: Joi.string(),
    protocol: Joi.string().valid('http', 'https'),
    url: Joi.string().uri({ scheme: ['http', 'https'] }),
    operationId: Joi.string().valid(...apiOperationIds),
    tag: Joi.string().valid(...apiTags),
    encrypted: Joi.boolean(),
    logger: Joi.any(),
    request: Joi.any(),
    results: Joi.any(),
    requestTimer: Joi.any(),
};

const RequestContextModel = buildModel('RequestContext', contextSchema);

class RequestContext extends RequestContextModel {
    constructor(request) {
        const host = request.headers.host || 'localhost';
        const protocol = RequestContext._determineProtocol(request);
        const encrypted = protocol === 'https';
        const url = `${protocol}://${host}${request.url}`;
        const tag = request.swagger.operation['x-router-controller'];
        const { operationId } = request.swagger.operation;

        const requestTimer = tag !== 'internal'
            ? httpRequestDurationSeconds.startTimer({ action: operationId })
            : null;

        request.logger.logger.addDefaultFields({
            tag,
            operationId,
            service: 'utapi',
        });

        super({
            request,
            host,
            url,
            protocol,
            operationId,
            tag,
            encrypted,
            results: new ResponseContainer(),
            logger: request.logger,
            requestTimer,
        });
    }

    static _determineProtocol(request) {
        // Respect the X-Forwarded-Proto header if set
        if (request.headers['x-forwarded-proto']) {
            return request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        }
        // Use req.connection.encrypted for fallback
        return request.connection.encrypted !== undefined
            && request.connection.encrypted ? 'https' : 'http';
    }
}


module.exports = RequestContext;
