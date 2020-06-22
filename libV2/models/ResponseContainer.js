const Joi = require('@hapi/joi');
const { buildModel } = require('./Base');

const orNull = schema => Joi.alternatives(schema, Joi.any().valid(null));

const responseSchema = {
    body: Joi.any(),
    statusCode: orNull(Joi.number().min(100).max(599)),
    redirect: orNull(Joi.string().uri({ scheme: ['http', 'https'], allowRelative: true })),
};
const ResponseContainerModel = buildModel('RequestContext', responseSchema);

class ResponseContainer extends ResponseContainerModel {
    constructor() {
        super({ body: null, statusCode: null, redirect: null });
    }

    hasBody() {
        return this.body !== null;
    }

    hasStatusCode() {
        return this.statusCode !== null;
    }

    hasRedirect() {
        return this.redirect !== null;
    }
}

module.exports = ResponseContainer;
