const assert = require('assert');
const sinon = require('sinon');
const uuid = require('uuid');

const { clients: warp10Clients } = require('../../../libV2/warp10');
const { MonitorDiskUsage } = require('../../../libV2/tasks');
const { UtapiMetric } = require('../../../libV2/models');
const { now } = require('../../../libV2/utils');

const { fetchRecords } = require('../../utils/v2Data');

// eslint-disable-next-line func-names
describe('Test MonitorDiskUsage soft limit', function () {
    this.timeout(30000);
    let task;
    let path;

    beforeEach(async () => {
        path = `/tmp/diskusage-${uuid.v4()}`;
        task = new MonitorDiskUsage({ warp10: warp10Clients });
        await task.setup();
        task._path = path;
        task._enabled = true;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should delete metrics older than the retention period', async () => {
        task._expirationEnabled = true;
        task._program.leader = true;
        task._metricRetentionMicroSecs = 0; // Force it to expire everything older than the given timestamp
        const expireSpy = sinon.spy(task, '_expireMetrics');
        const deleteStub = sinon.spy(task._warp10Clients[0], 'delete');

        const timestamp = now();

        await task._warp10Clients[0].ingest({ className: 'utapi.event' }, [
            new UtapiMetric({ timestamp, bucket: 'foo' }),
            new UtapiMetric({ timestamp: timestamp + 1, bucket: 'foo' }),
        ]);
        await task._execute(timestamp);
        assert(expireSpy.calledOnce);
        assert(deleteStub.calledOnce);
        assert(deleteStub.calledOnceWith(
            {
                className: '~.*',
                start: timestamp - 1, // start is not inclusive
                end: timestamp,
            },
        ));

        const series = await fetchRecords(
            task._warp10Clients[0],
            'utapi.event',
            { },
            { end: timestamp + 2, count: 100 },
            '@utapi/decodeEvent',
        );
        assert.strictEqual(series[0].values.length, 1);
    });
});
