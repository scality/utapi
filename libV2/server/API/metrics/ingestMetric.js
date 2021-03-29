const errors = require('../../../errors');
const { UtapiMetric } = require('../../../models');
const { convertTimestamp } = require('../../../utils');
const { ingestionOpTranslationMap } = require('../../../constants');

async function ingestMetric(ctx, params) {
    let metrics;
    try {
        metrics = params.body.map(m => new UtapiMetric({
            ...m,
            timestamp: convertTimestamp(m.timestamp),
            operationId: ingestionOpTranslationMap[m.operationId] || m.operationId,
        }));
    } catch (error) {
        throw errors.InvalidRequest;
    }
    try {
        await Promise.all(metrics.map(m => this.cacheClient.pushMetric(m)));
    } catch (error) {
        throw errors.ServiceUnavailable;
    }
    // eslint-disable-next-line no-param-reassign
    ctx.results.statusCode = 200;
}

module.exports = ingestMetric;
