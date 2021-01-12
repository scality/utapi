const assert = require('assert');
const sinon = require('sinon');
const uuid = require('uuid');

const { MonitorDiskUsage } = require('../../../libV2/tasks');
const { UtapiMetric } = require('../../../libV2/models');
const { now } = require('../../../libV2/utils');

const { fillDir } = require('../../utils/v2Data');

async function writeEvent(task) {
    await task._warp10.ingest({ className: 'workaround' }, [
        new UtapiMetric({ timestamp: now(), bucket: 'foo' }),
    ]);
    return task._warp10.ingest({ className: 'utapi.event' }, [
        new UtapiMetric({ timestamp: now(), bucket: 'foo' }),
    ]);
}

// eslint-disable-next-line func-names
describe('Test MonitorDiskUsage soft limit', function () {
    this.timeout(30000);
    let task;
    let path;

    beforeEach(async () => {
        path = `/tmp/diskusage-${uuid.v4()}`;
        task = new MonitorDiskUsage();
        await task.setup();
        task._path = path;
        task._enabled = true;
    });

    it('should not trigger delete if below the limit', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 10240;
        const checkSpy = sinon.spy(task, '_checkSoftLimit');
        const expireSpy = sinon.spy(task, '_expireMetrics');
        await task.execute();
        assert(checkSpy.calledOnce);
        assert(checkSpy.returned(false));
        assert(expireSpy.notCalled);
    });

    it('should trigger delete if above the limit', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 1;
        const checkSpy = sinon.spy(task, '_checkSoftLimit');
        const expireSpy = sinon.spy(task, '_expireMetrics');
        const deleteStub = sinon.spy(task._warp10, 'delete');
        await writeEvent(task);
        await task.execute();
        assert(checkSpy.calledOnce);
        assert(checkSpy.returned(true));
        assert(expireSpy.calledOnce);
        assert(deleteStub.calledOnce);
    });

    it('should not trigger delete if run in distributed mode, not the leader, and over the limit', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 1;
        task._mode = 'distributed';
        const usageSpy = sinon.spy(task, '_getUsage');
        const checkSpy = sinon.spy(task, '_checkSoftLimit');
        const expireSpy = sinon.spy(task, '_expireMetrics');
        await task.execute();
        assert(usageSpy.calledOnce);
        assert(checkSpy.notCalled);
        assert(expireSpy.notCalled);
    });

    it('should delete if run in distributed mode, is the leader, and is over the limit', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 1;
        task._mode = 'distributed';
        task._program.leader = true;
        const usageSpy = sinon.spy(task, '_getUsage');
        const checkSpy = sinon.spy(task, '_checkSoftLimit');
        const expireSpy = sinon.spy(task, '_expireMetrics');
        await writeEvent(task);
        await task.execute();
        assert(usageSpy.notCalled);
        assert(checkSpy.calledOnce);
        assert(expireSpy.calledOnce);
    });

    it('should write storage used to warp 10 if run in distributed mode and not the leader', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 1000;
        task._mode = 'distributed';
        const usageSpy = sinon.spy(task, '_getUsage');
        const checkSpy = sinon.spy(task, '_checkSoftLimit');
        const updateSpy = sinon.spy(task._warp10, 'update');
        const timestamp = now();
        await task._execute(timestamp);
        assert(usageSpy.calledOnce);
        assert(checkSpy.notCalled);
        assert(
            updateSpy.calledOnceWith([
                {
                    timestamp,
                    className: 'utapi.disk.monitor',
                    value: await usageSpy.firstCall.returnValue,
                    labels: { node: task.nodeId },
                },
            ]),
        );
    });

    it('should not throw when failing to fetch disk usage in leader mode', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 1;
        task._mode = 'distributed';
        task._program.leader = true;
        sinon.stub(task._warp10, 'fetch').throws();
        await writeEvent(task);
        const _task = task.execute();
        assert.doesNotReject(_task);
    });

    it('should not throw when failing to write disk usage in distributed mode', async () => {
        fillDir(path, { count: 1, size: 100 });
        task._softLimit = 1;
        task._mode = 'distributed';
        sinon.stub(task._warp10, 'update').throws();
        const _task = task.execute();
        assert.doesNotReject(_task);
    });
});
