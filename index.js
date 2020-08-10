/* eslint-disable global-require */

// eslint-disable-line strict
let toExport;

if (process.env.ENABLE_UTAPI_V2) {
    toExport = {
        utapiVersion: 2,
        startUtapiServer: require('./libV2/server').startServer,
        UtapiClient: require('./libV2/client'),
        tasks: require('./libV2/tasks'),
    };
} else {
    toExport = {
        utapiVersion: 1,
        UtapiServer: require('./lib/server'),
        UtapiClient: require('./lib/UtapiClient'),
        UtapiReplay: require('./lib/UtapiReplay'),
        UtapiReindex: require('./lib/UtapiReindex'),
    };
}

module.exports = toExport;
