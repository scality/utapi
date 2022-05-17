const assert = require('assert');

const APIController = require('../../../../libV2/server/controller');
const healthcheck = require('../../../../libV2/server/API/internal/healthcheck');
const prometheusMetrics = require('../../../../libV2/server/API/internal/prometheusMetrics');

const { ResponseContainer } = require('../../../../libV2/models');
const { ExpressResponseStub, templateRequest } = require('../../../utils/v2Data');


describe('Test APIController', () => {
    it('should load a valid module', () => {
        const module = APIController._safeRequire('./controller');
        assert.deepStrictEqual(module, APIController);
    });

    it('should return null for a MODULE_NOT_FOUND error', () => {
        const module = APIController._safeRequire('/tmp/doesntexist');
        assert.deepStrictEqual(module, null);
    });

    it('should rethrow a non-MODULE_NOT_FOUND error', () => {
        // We use a json file to avoid mocha trying to load it and exiting
        assert.throws(() => APIController._safeRequire('../../tests/unit/v2/server/hasanerror.json'));
    });

    it('should load an operation handler', () => {
        const handler = APIController._getOperationHandler('internal', 'healthcheck');
        assert(typeof handler === 'function');
    });

    it('should patch a NotImplemented handler for MODULE_NOT_FOUND errors', async () => {
        const handler = APIController._getOperationHandler('invalid', 'idontexist');
        assert(typeof handler === 'function');
        assert.rejects(handler, error => {
            assert.strictEqual(error.code, 501);
            assert(error.is.NotImplemented);
        });
    });

    it('should load handlers for a tag', () => {
        const handlers = APIController._collectHandlers('internal');
        assert.deepStrictEqual(handlers, {
            healthcheck,
            prometheusMetrics,
        });
    });

    it('should extract a requests parameters', () => {
        const req = {
            swagger: {
                params: {
                    foo: {
                        value: 'bar',
                    },
                },
            },
        };
        assert.deepStrictEqual(APIController._extractParams(req), { foo: 'bar' });
    });

    describe('Test APIController::_writeResult', () => {
        let results;
        let response;

        beforeEach(() => {
            results = new ResponseContainer();
            response = new ExpressResponseStub();
        });

        it('should redirect', async () => {
            results.redirect = 'http://example.com';
            await APIController._writeResult(results, response);
            assert.strictEqual(response._redirect, 'http://example.com');
        });

        it('should send both boday and status code', async () => {
            results.statusCode = 200;
            results.body = 'foo';
            await APIController._writeResult(results, response);
            assert.strictEqual(response._status, 200);
            assert.strictEqual(response._body, 'foo');
        });

        it('should send only a status code', async () => {
            results.statusCode = 200;
            await APIController._writeResult(results, response);
            assert.strictEqual(response._status, 200);
            assert.strictEqual(response._body, null);
        });

        it('should add a 200 status code', async () => {
            results.body = 'foo';
            await APIController._writeResult(results, response);
            assert.strictEqual(response._status, 200);
            assert.strictEqual(response._body, 'foo');
        });
    });

    it('should call an operation', next => {
        const response = new ExpressResponseStub();
        APIController.callOperation(
            'healthcheck',
            healthcheck,
            [],
            templateRequest(),
            response,
            err => {
                try {
                    assert.strictEqual(err, undefined);
                    assert.strictEqual(response._status, 200);
                } catch (error) {
                    next(error);
                    return;
                }
                next();
            },
        );
    });
});
