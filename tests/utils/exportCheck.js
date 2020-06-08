/* eslint-disable no-console */
const assert = require('assert');

const utapi = require('../../');

const version1Exports = {
    UtapiServer: require('../../lib/server'),
    UtapiClient: require('../../lib/UtapiClient'),
    UtapiReplay: require('../../lib/UtapiReplay'),
    UtapiReindex: require('../../lib/UtapiReindex'),
};

const version2Exports = {
    version: 2,
};

const versionToCheck = process.argv[2];

if (versionToCheck === undefined) {
    console.error('You must provide a version to check! (1, 2)');
    process.exit(255);
}

let passed = false;
try {
    if (versionToCheck === '1') {
        assert.deepStrictEqual(utapi, version1Exports);
        console.log('Test has passed!');
        passed = true;
    } else if (versionToCheck === '2') {
        assert.deepStrictEqual(utapi, version2Exports);
        console.log('Test has passed!');
        passed = true;
    }
} catch (err) {
    console.error('Test has failed!');
}

process.exit(passed ? 0 : 1);
