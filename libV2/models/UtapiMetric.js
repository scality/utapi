const Joi = require('@hapi/joi');

const { operations } = require('../constants');
const { buildModel } = require('./Base');

const metricSchema = {
    operationId: Joi.string().valid(...operations),
    uuid: Joi.string(),
    timestamp: Joi.number(),
    bucket: Joi.string(),
    object: Joi.string(),
    versionId: Joi.string(),
    account: Joi.string(),
    user: Joi.string(),
    location: Joi.string(),
    objectDelta: Joi.number(),
    sizeDelta: Joi.number(),
    incomingBytes: Joi.number(),
    outgoingBytes: Joi.number(),
};

module.exports = buildModel('UtapiMetric', metricSchema);
