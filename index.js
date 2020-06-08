'use strict'; // eslint-disable-line strict

let toExport;

if (process.env.ENABLE_UTAPI_V2) {
    toExport = {
        version: 2,
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
