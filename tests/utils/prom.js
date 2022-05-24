const promClient = require('prom-client');

async function getMetricValues(name) {
    const metric = await promClient.register.getSingleMetric(name);
    const data = await metric.get();
    return data.values;
}

module.exports = {
    getMetricValues,
};
