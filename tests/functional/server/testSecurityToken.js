const assert = require('assert');
const { makeUtapiGenericClientRequest } = require('../../utils/utils');
const Vault = require('../../utils/mock/Vault');

describe('Test STS security token passing', function test() {
    const vault = new Vault();

    before(() => {
        vault.start();
    });

    after(() => {
        vault.end();
    });

    it('should pass security token to Vault', done => {
        const reqHeader = {
            method: 'POST',
            path: '/accounts?Action=ListRecentMetrics',
        };
        const reqBody = {
            accounts: ['1234567890'],
        };
        makeUtapiGenericClientRequest(reqHeader, reqBody, (err, res) => {
            assert.ifError(err);
            const data = JSON.parse(res);
            assert.strictEqual(data.code, undefined);
            done();
        }, true);
    });

    it('should not pass security token to Vault', done => {
        const reqHeader = {
            method: 'POST',
            path: '/accounts?Action=ListRecentMetrics',
        };
        const reqBody = {
            accounts: ['1234567890'],
        };
        makeUtapiGenericClientRequest(reqHeader, reqBody, (err, res) => {
            assert.ifError(err);
            const data = JSON.parse(res);
            assert.strictEqual(data.code, undefined);
            done();
        });
    });
});
