const config = require('./dist/lib/Config').default;
const server = require('./dist/lib/server').default;

server(Object.assign({}, config, { component: 's3' }));
