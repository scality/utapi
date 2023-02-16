const promClient = require('prom-client');

const httpRequestsTotal = new promClient.Counter({
    name: 's3_utapi_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['action', 'code'],
});

const httpRequestDurationSeconds = new promClient.Histogram({
    name: 's3_utapi_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['action', 'code'],
    // buckets for response time from 0.1ms to 60s
    buckets: [0.0001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0, 5.0, 15.0, 30.0, 60.0],
});

module.exports = {
    httpRequestDurationSeconds,
    httpRequestsTotal,
};
