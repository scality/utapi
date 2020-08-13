const errors = require('../../../errors');
const { UtapiMetric } = require('../../../models');
const { client: cacheClient } = require('../../../cache');
const { convertTimestamp } = require('../../../utils');

async function ingestMetric(ctx, params) {
    let metrics;
    try {
        metrics = params.body.map(m => new UtapiMetric({
            ...m,
            timestamp: convertTimestamp(m.timestamp),
        }));
    } catch (error) {
        throw errors.InvalidRequest;
    }
    try {
        await Promise.all(metrics.map(m => cacheClient.pushMetric(m)));
    } catch (error) {
        throw errors.ServiceUnavailable;
    }
    // eslint-disable-next-line no-param-reassign
    ctx.results.statusCode = 200;
}

module.exports = ingestMetric;
