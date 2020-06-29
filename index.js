/* eslint-disable global-require */
// eslint-disable-line strict
let toExport;

if (process.env.ENABLE_UTAPI_V2) {
    const { startServer } = require('./libV2/server');
    toExport = {
        version: 2,
        startServer,
    };
} else {
    toExport = {
        UtapiServer: require('./lib/server'),
        UtapiClient: require('./lib/UtapiClient'),
        UtapiReplay: require('./lib/UtapiReplay'),
        UtapiReindex: require('./lib/UtapiReindex'),
    };
}

module.exports = toExport;
