const assert = require('assert');
const sinon = require('sinon');

const { middleware } = require('../../../../libV2/server/middleware');
const { templateRequest, ExpressResponseStub } = require('../../../utils/v2Data');

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
});
