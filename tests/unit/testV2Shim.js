/* eslint-disable no-console */
const { fork } = require('child_process');
const path = require('path');
const assert = require('assert');

const checker = path.resolve(__dirname, '../utils/exportCheck');

function execShim(version, env, callback) {
    const proc = fork(checker, [version], {
        env,
        stdio: 'pipe',
    });
    let exited = false;
    proc.on('error', err => {
        exited = true;
        console.log(`An error occurred while running the subprocess, ${err}`);
        callback(false);
    });
    proc.on('exit', exitCode => {
        if (!exited) {
            exited = true;
            callback(exitCode === 0);
        }
    });
}

describe('Test v2 Feature Toggle', () => {
    it('should import v1 when ENABLE_UTAPI_V2 is not set', done => {
        execShim(1, {}, results => {
            assert(results);
            done();
        });
    });

    it('should import v2 when ENABLE_UTAPI_V2 is set', done => {
        execShim(2, { ENABLE_UTAPI_V2: 'true' }, results => {
            assert(results);
            done();
        });
    });
});
