const errors = require('../../../errors');
const { UtapiMetric } = require('../../../models');
const { client: cacheClient } = require('../../../cache');

async function ingestMetric(ctx, params) {
    let metrics;
    try {
        metrics = params.body.map(m => new UtapiMetric(m));
    } catch (error) {
        throw errors.InvalidRequest;
    }
    try {
        await Promise.all(metrics.map(m => cacheClient.pushMetric(m)));
    } catch (error) {
        throw errors.ServiceUnavailable;
    }
    ctx.results.statusCode = 200;
}

module.exports = ingestMetric;
