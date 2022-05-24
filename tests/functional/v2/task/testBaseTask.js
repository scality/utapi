const assert = require('assert');
const needle = require('needle');
const promClient = require('prom-client');
const sinon = require('sinon');
const { DEFAULT_METRICS_ROUTE } = require('arsenal').network.probe.ProbeServer;

const { BaseTask } = require('../../../../libV2/tasks');
const { clients: warp10Clients } = require('../../../../libV2/warp10');

const { getMetricValues } = require('../../../utils/prom');

const METRICS_SERVER_PORT = 10999;

class CustomTask extends BaseTask {
    // eslint-disable-next-line class-methods-use-this
    _registerMetricHandlers() {
        const foo = new promClient.Gauge({
            name: 'utapi_custom_task_foo_total',
            help: 'Count of foos',
            labelNames: ['origin', 'containerName'],
        });

        return { foo };
    }

    async _execute() {
        this._metricsHandlers.foo.inc(1);
    }
}

describe('Test BaseTask metrics', () => {
    let task;

    beforeEach(async () => {
        task = new CustomTask({
            enableMetrics: true,
            metricsPort: METRICS_SERVER_PORT,
            warp10: [warp10Clients[0]],
        });
        await task.setup();
    });

    afterEach(async () => {
        await task.join();
        promClient.register.clear();
    });

    it('should start a metrics server on the provided port', async () => {
        const res = await needle(
            'get',
            `http://localhost:${METRICS_SERVER_PORT}${DEFAULT_METRICS_ROUTE}`,
        );
        const lines = res.body.split('\n');
        const first = lines[0];
        assert.strictEqual(res.statusCode, 200);
        assert(first.startsWith('# HELP'));
    });

    it('should push metrics for a task execution', async () => {
        await task.execute();
        const timeValues = await getMetricValues('utapi_custom_task_duration_seconds');
        assert.strictEqual(timeValues.length, 1);

        const attemptsValues = await getMetricValues('utapi_custom_task_attempts_total');
        assert.deepStrictEqual(attemptsValues, [{ value: 1, labels: {} }]);

        const failuresValues = await getMetricValues('utapi_custom_task_failures_total');
        assert.deepStrictEqual(failuresValues, []);
    });

    it('should push metrics for a failed task execution', async () => {
        sinon.replace(task, '_execute', sinon.fake.rejects('forced failure'));
        await task.execute();
        const failuresValues = await getMetricValues('utapi_custom_task_failures_total');
        assert.deepStrictEqual(failuresValues, [{ value: 1, labels: {} }]);
    });

    it('should allow custom handlers to be registered', async () => {
        await task.execute();
        const fooValues = await getMetricValues('utapi_custom_task_foo_total');
        assert.deepStrictEqual(fooValues, [{ value: 1, labels: {} }]);
    });
});
