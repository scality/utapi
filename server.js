require('babel-core/register')();
const server = require('./src/lib/server').default;

server();
