const ApiController = require('../controller');

const metricController = new ApiController('metrics');
const internalController = new ApiController('internal');

module.exports = {
    metricController,
    internalController,
};
