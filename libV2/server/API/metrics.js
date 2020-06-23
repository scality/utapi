const ApiController = require('../controller');

const controller = new ApiController('metrics');

module.exports = controller.buildMap();
