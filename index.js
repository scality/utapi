'use strict'; // eslint-disable-line strict

require('babel-core/register');
// module.exports = {
//     server: require('./lib/server.js'),
// };
require('./lib/server.js').default();
