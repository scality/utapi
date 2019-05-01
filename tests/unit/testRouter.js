import assert from 'assert';
import { errors } from 'arsenal';
import { Logger } from 'werelogs';
import config from '../../src/lib/Config';
import Router from '../../src/router/Router';
import UtapiRequest from '../../src/lib/UtapiRequest';

describe('Router', () => {
    const router = new Router(config);

    describe('::_authSquared', () => {
        const log = new Logger('UtapiRequest');
        const request = new UtapiRequest().setLog(log);

        describe('with unauthorized request', () => {
            before(() => {
                const incomingMessage = {
                    headers: {
                        authorization: false,
                    },
                };
                request.setRequest(incomingMessage);
            });

            after(() => {
                request.setRequest(null);
            });

            it('should return InvalidRequest error', done => {
                const expected = errors.InvalidRequest
                    .customizeDescription('Must use Auth V4 for this request.');
                router._authSquared(request, err => {
                    assert.deepStrictEqual(expected, err);
                    done();
                });
            });

            describe('with NO_AUTH=true', () => {
                before(() => {
                    process.env.NO_AUTH = 'true';
                });

                after(() => {
                    process.env.NO_AUTH = 'false';
                });

                it('should not return InvalidRequest error', done => {
                    router._authSquared(request, done);
                });
            });
        });
    });
});
