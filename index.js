'use strict'; // eslint-disable-line strict

require('babel-core/register');
module.exports = {
    UtapiServer: require('./lib/server.js').default,
    UtapiClient: require('./lib/UtapiClient.js').default,
};
