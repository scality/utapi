const assert = require('assert');
const sinon = require('sinon');

const { clients: warp10Clients } = require('../../../libV2/warp10');
const { MonitorDiskUsage } = require('../../../libV2/tasks');
const { UtapiMetric } = require('../../../libV2/models');
const { now } = require('../../../libV2/utils');
const { expirationChunkDuration } = require('../../../libV2/constants');

const { fetchRecords } = require('../../utils/v2Data');

// eslint-disable-next-line func-names
describe('Test MonitorDiskUsage soft limit', function () {
    this.timeout(30000);
    let task;

    beforeEach(async () => {
        task = new MonitorDiskUsage({ warp10: warp10Clients });
        await task.setup();
        task._expirationEnabled = true;
        task._program.leader = true;
    });

    afterEach(async () => {
        sinon.restore();
        await warp10Clients[0].delete({ className: 'utapi.event', start: 0, end: Date.now() * 1000 });
    });

    it('should delete metrics older than the retention period', async () => {
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

    it('should chunk deletion range into expirationChunkDuration slices', async () => {
        task._metricRetentionMicroSecs = 0; // Force it to expire everything older than the given timestamp
        const expireSpy = sinon.spy(task, '_expireMetrics');
        const deleteStub = sinon.spy(task._warp10Clients[0], 'delete');

        const timestamp = now();

        // Write an event older than the maximum chunk duration to ensure we produce 2 calls
        const recordTimestamp = timestamp - expirationChunkDuration;

        await task._warp10Clients[0].ingest({ className: 'utapi.event' }, [
            new UtapiMetric({ timestamp: recordTimestamp, bucket: 'foo' }),
            new UtapiMetric({ timestamp: timestamp + 1, bucket: 'foo' }),
        ]);

        await task._execute(timestamp);
        assert(expireSpy.calledOnce);
        assert(deleteStub.calledTwice);
        assert(deleteStub.firstCall.calledWithExactly(
            {
                className: '~.*',
                start: recordTimestamp - 1,
                end: timestamp - 2,
            },
        ));
        assert(deleteStub.secondCall.calledWithExactly(
            {
                className: '~.*',
                start: timestamp - 1,
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
