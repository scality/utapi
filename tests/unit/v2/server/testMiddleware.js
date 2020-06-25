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
        let resp;

        beforeEach(() => {
            resp = new ExpressResponseStub();
        });

        it('should set a default code and message', () => {
            middleware.errorMiddleware({}, null, resp);
            assert.strictEqual(resp._status, 500);
            assert.deepStrictEqual(resp._body, {
                error: {
                    code: '500',
                    message: 'Internal Error',
                },
            });
        });

        it('should set the correct info from an error', () => {
            middleware.errorMiddleware({ code: 123, message: 'Hello World!', utapiError: true }, null, resp);
            assert.deepStrictEqual(resp._body, {
                error: {
                    code: '123',
                    message: 'Hello World!',
                },
            });
        });

        it("should replace a error's message if it's internal and not in development mode", () => {
            middleware.errorMiddleware({ code: 123, message: 'Hello World!' }, null, resp);
            assert.deepStrictEqual(resp._body, {
                error: {
                    code: '123',
                    message: 'Internal Error',
                },
            });
        });
    });
});
