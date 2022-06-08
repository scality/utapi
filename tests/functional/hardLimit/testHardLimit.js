const assert = require('assert');
const fs = require('fs');
const sinon = require('sinon');
const uuid = require('uuid');
const promClient = require('prom-client');

const { clients: warp10Clients } = require('../../../libV2/warp10');
const { MonitorDiskUsage } = require('../../../libV2/tasks');

const { fillDir } = require('../../utils/v2Data');
const { assertMetricValue } = require('../../utils/prom');

// eslint-disable-next-line func-names
describe('Test MonitorDiskUsage hard limit', function () {
    this.timeout(30000);
    let task;
    let path;

    beforeEach(async () => {
        path = `/tmp/diskusage-${uuid.v4()}`;
        fs.mkdirSync(`${path}/datalog`, { recursive: true });
        promClient.register.clear();
        task = new MonitorDiskUsage({ warp10: warp10Clients, enableMetrics: true });
        await task.setup();
        task._path = path;
        task._enabled = true;
    });

    afterEach(async () => task.join());

    it('should trigger a database lock if above the limit', async () => {
        fillDir(`${path}/leveldb`, { count: 1, size: 100 });
        task._hardLimit = 1;
        const checkSpy = sinon.spy(task, '_checkHardLimit');
        const lockSpy = sinon.spy(task, '_disableWarp10Updates');
        const unlockSpy = sinon.spy(task, '_enableWarp10Updates');
        const execStub = sinon.spy(task._warp10Clients[0], 'exec');
        await task.execute();
        assert(checkSpy.calledOnce);
        assert(checkSpy.returned(true));
        assert(lockSpy.calledOnce);
        assert(unlockSpy.notCalled);
        assert(execStub.calledOnce);
        await assertMetricValue('utapi_monitor_disk_usage_hard_limit_bytes', 1);
    });

    it('should trigger a database unlock if below the limit', async () => {
        fillDir(`${path}/leveldb`, { count: 1, size: 100 });
        task._hardLimit = 10240;
        const checkSpy = sinon.spy(task, '_checkHardLimit');
        const lockSpy = sinon.spy(task, '_disableWarp10Updates');
        const unlockSpy = sinon.spy(task, '_enableWarp10Updates');
        await task.execute();
        assert(checkSpy.calledOnce);
        assert(checkSpy.returned(false));
        assert(lockSpy.notCalled);
        assert(unlockSpy.calledOnce);
    });

    it('should not throw when failing to calculate disk usage', async () => {
        fillDir(`${path}/leveldb`, { count: 1, size: 100 });
        task._hardLimit = 1;
        sinon.stub(task, '_getUsage').throws();
        const _task = task.execute();
        assert.doesNotReject(_task);
    });
});
