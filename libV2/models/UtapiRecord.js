const Joi = require('joi');
const { buildModel } = require('./Base');

const recordSchema = {
    timestamp: Joi.number(),
    objectDelta: Joi.number(),
    sizeDelta: Joi.number(),
    incomingBytes: Joi.number(),
    outgoingBytes: Joi.number(),
    operations: Joi.object(),
};

module.exports = buildModel('UtapiRecord', recordSchema);
