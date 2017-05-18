require('babel-core/register')();
const UtapiReplay = require('./src/lib/UtapiReplay').default;
const config = require('./src/lib/Config').default;

const replay = new UtapiReplay(config);
replay.start();
