require('babel-core/register')();
const UtapiReplay = require('./src/lib/UtapiReplay').default;

const replay = new UtapiReplay();
replay.start();
