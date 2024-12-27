const assert = require('assert');
const { errors } = require('arsenal');
const { makeUtapiGenericClientRequest } = require('../../utils/utils');
const Vault = require('../../utils/mock/Vault');

describe('Invalid requests', () => {
    const vault = new Vault();

    before(() => {
        vault.start();
    });

    after(() => {
        vault.end();
    });

    const tests = [
        {
            describe: 'should forbid a GET request ',
            header: {
                host: 'localhost',
                port: 8100,
                method: 'GET',
                service: 's3',
                path: '/cms/hdr.php?pg=<script>alert(document.domain)</script>',
            },
            body: {},
            response: errors.AccessForbidden,
        },
        {
            describe: 'should forbid a GET request ',
            header: {
                host: 'localhost',
                port: 8100,
                method: 'GET',
                service: 's3',
                path: '/buckets/Action=ListMetrics',
            },
            body: {},
            response: errors.AccessForbidden,
        },
    ];

    tests.forEach(test => {
        it(`${test.describe}`, done => {
            makeUtapiGenericClientRequest(test.header, test.body,
                (err, response) => {
                    if (err) {
                        return done(err);
                    }
                    const data = JSON.parse(response);
                    assert.deepStrictEqual(test.response.description,
                        data.message);
                    return done();
                });
        });
    });
});
