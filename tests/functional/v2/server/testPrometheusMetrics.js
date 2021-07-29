const assert = require('assert');
const needle = require('needle');

const testMetrics = async pair => {
    const [name, url] = pair;
    it.only(`should return metrics for ${name} from url ${url}`, async () => {
        const res = await needle('get', url);
        const lines = res.body.split('\n');
        const first = lines[0];

        assert.strictEqual(res.statusCode, 200);
        assert(first.startsWith('# HELP') === true);
    });
};

describe('Test Prometheus Metrics', () => {
    const nameUrlPairs = [
        ['utapi nodejs service exporter', 'http://localhost:8100/_/metrics'],
        ['sensision exporter', 'http://localhost:9718/metrics'],
        ['redis exporter', 'http://localhost:9121/metrics'],
    ];
    nameUrlPairs.forEach(pair => testMetrics(pair));
});

