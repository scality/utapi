const Joi = require('@hapi/joi');
const { buildModel } = require('./Base');

const recordSchema = {
    timestamp: Joi.number(),
    objectDelta: Joi.number(),
    sizeDelta: Joi.number(),
    incomingBytes: Joi.number(),
    outgoingBytes: Joi.number(),
};

module.exports = buildModel('UtapiRecord', recordSchema);
