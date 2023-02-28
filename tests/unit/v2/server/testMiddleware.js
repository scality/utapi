const assert = require('assert');
const sinon = require('sinon');
const promClient = require('prom-client');

const { middleware } = require('../../../../libV2/server/middleware');
const { templateRequest, ExpressResponseStub } = require('../../../utils/v2Data');
const RequestContext = require('../../../../libV2/models/RequestContext');
const { getMetricValues, assertMetricValue } = require('../../../utils/prom');

describe('Test middleware', () => {
    it('should build a request logger', next => {
        const req = templateRequest();
        middleware.loggerMiddleware(
            req,
            null,
            () => {
                // werelogs doesn't export its RequestLogger class
                // so this is about the best we can do
                assert(req.logger !== undefined);
                assert(req.logger.info !== undefined);
                next();
            },
        );
    });

    it('should call the `end` method of a request logger', next => {
        const req = templateRequest();
        const spy = sinon.spy();
        req.logger.end = spy;
        middleware.responseLoggerMiddleware(
            req,
            { statusCode: 200, statusMessage: 'OK' },
            () => {
                assert(spy.calledOnceWith('finished handling request', {
                    httpCode: 200,
                    httpMessage: 'OK',
                }));
                next();
            },
        );
    });

    describe('test errorMiddleware', () => {
        let req;
        let resp;

        beforeEach(() => {
            req = templateRequest();
            resp = new ExpressResponseStub();
        });

        it('should set a default code and message', () => {
            middleware.errorMiddleware({}, req, resp);
            assert.strictEqual(resp._status, 500);
            assert.deepStrictEqual(resp._body, {
                code: 'InternalError',
                message: 'Internal Error',
            });
        });

        it('should set the correct info from an error', () => {
            middleware.errorMiddleware({
                message: 'Hello World!',
                description: 'imadesc',
                utapiError: true,
            }, req, resp);
            assert.deepStrictEqual(resp._body, {
                code: 'Hello World!',
                message: 'imadesc',
            });
        });

        it("should replace an error's message if it's internal and not in development mode", () => {
            middleware.errorMiddleware({ code: 123, message: 'Hello World!' }, req, resp);
            assert.deepStrictEqual(resp._body, {
                code: 'InternalError',
                message: 'Internal Error',
            });
        });

        it('should call responseLoggerMiddleware after response', () => {
            const spy = sinon.spy();
            req.logger.end = spy;
            resp.statusMessage = 'Hello World!';
            middleware.errorMiddleware({ code: 123 }, req, resp);
            assert(spy.calledOnceWith('finished handling request', {
                httpCode: 123,
                httpMessage: 'Hello World!',
            }));
        });
    });

    describe('test httpMetricsMiddleware', () => {
        let resp;

        beforeEach(() => {
            resp = new ExpressResponseStub();
            resp.status(200);
        });

        afterEach(() => {
            promClient.register.clear();
        });

        it('should increment the counter if not an internal route', async () => {
            const req = templateRequest({
                swagger: {
                    operation: {
                        'x-router-controller': 'metrics',
                        'operationId': 'listMetrics',
                    },
                },
            });

            req.ctx = new RequestContext(req);
            middleware.httpMetricsMiddleware(req, resp);
            await assertMetricValue('s3_utapi_http_requests_total', 1);
            const durationMetric = 's3_utapi_http_request_duration_seconds';
            const duration = await getMetricValues(durationMetric);
            // 14 defined buckets + 1 for Infinity
            assert.strictEqual(
                duration.filter(metric => metric.metricName === `${durationMetric}_bucket`).length,
                15,
            );
            const count = duration.filter(metric => metric.metricName === `${durationMetric}_count`);
            assert.deepStrictEqual(count, [{
                labels: {
                    action: 'listMetrics',
                    code: 200,
                },
                metricName: `${durationMetric}_count`,
                value: 1,
            }]);
            assert.strictEqual(count[0].value, 1);
        });

        it('should not increment the counter if an internal route', async () => {
            const req = templateRequest();
            req.ctx = new RequestContext(req);
            middleware.httpMetricsMiddleware(req, resp);
            assert.rejects(() => getMetricValues('s3_utapi_http_requests_total'));
        });
    });
});
