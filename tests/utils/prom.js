const promClient = require('prom-client');
const assert = require('assert');

async function getMetricValues(name) {
    const metric = await promClient.register.getSingleMetric(name);
    const data = await metric.get();
    return data.values;
}

async function assertMetricValue(name, value) {
    const values = await getMetricValues(name);
    assert.strictEqual(values.length, 1);
    const [metric] = values;
    assert.strictEqual(metric.value, value);
}

module.exports = {
    getMetricValues,
    assertMetricValue,
};
