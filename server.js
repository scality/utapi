const config = require('./lib/Config');
const server = require('./lib/server');

server(Object.assign({}, config, { component: 's3' }));
