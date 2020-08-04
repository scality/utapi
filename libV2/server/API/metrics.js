const ApiController = require('../controller');
const { authenticateV4 } = require('../../vault');

const controller = new ApiController('metrics', [
    authenticateV4,
]);

module.exports = controller.buildMap();
