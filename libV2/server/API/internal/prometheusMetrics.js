const { collectDefaultMetrics, register } = require('prom-client');

collectDefaultMetrics({
    timeout: 10000,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

async function prometheusMetrics(ctx) {
    ctx.results.statusCode = 200;
    ctx.results.body = await register.metrics();
}

module.exports = prometheusMetrics;
