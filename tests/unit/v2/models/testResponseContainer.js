const assert = require('assert');
const { ResponseContainer } = require('../../../../libV2/models');

describe('Test ResponseContainer', () => {
    let resp;
    beforeEach(() => { resp = new ResponseContainer(); });

    describe('Test redirect', () => {
        it('should have a redirect', () => {
            resp.redirect = 'http://example.com';
            assert.strictEqual(resp.hasRedirect(), true);
        });

        it('should not have a redirect', () => {
            assert.strictEqual(resp.hasRedirect(), false);
        });

        it('should allow a relative redirect', () => {
            resp.redirect = 'im/relative';
        });

        it('should not allow invalid redirect', () => {
            assert.throws(() => { resp.redirect = '\\foo\\bar '; });
        });

        it('should not allow a non-http scheme', () => {
            assert.throws(() => { resp.redirect = 'ftp://example.com'; });
        });
    });

    describe('Test hasBody', () => {
        it('should have a body', () => {
            resp.body = 'foo';
            assert.strictEqual(resp.hasBody(), true);
        });

        it('should not have a body', () => {
            assert.strictEqual(resp.hasBody(), false);
        });
    });

    describe('Test hasStatusCode', () => {
        it('should have a status code', () => {
            resp.statusCode = 200;
            assert.strictEqual(resp.hasStatusCode(), true);
        });

        it('should not have a status code', () => {
            assert.strictEqual(resp.hasStatusCode(), false);
        });

        it('should not allow status codes < 100', () => {
            assert.throws(() => { resp.statusCode = 99; });
        });


        it('should not allow status codes > 599', () => {
            assert.throws(() => { resp.statusCode = 600; });
        });
    });
});
