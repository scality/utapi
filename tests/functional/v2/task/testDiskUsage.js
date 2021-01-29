const assert = require('assert');
const uuid = require('uuid');

const { MonitorDiskUsage } = require('../../../../libV2/tasks');
const { getFolderSize } = require('../../../../libV2/utils');

const { fillDir } = require('../../../utils/v2Data');

class MonitorDiskUsageShim extends MonitorDiskUsage {
    async _getUsage() {
        this.usage = await super._getUsage();
        return this.usage;
    }
}

const testCases = [
    { count: 1, size: 100, expected: 100 },
    { count: 2, size: 200, expected: 400 },
    { count: 3, size: 150, expected: 450 },
    { count: 4, size: 111, expected: 444 },
    { count: 100, size: 1024 * 1024, expected: 104857600 },
];

// eslint-disable-next-line func-names
describe('Test MonitorDiskUsage', () => {
    let task;
    let path;
    let emptyDirSize;
    let emptyFileSize;

    // Different file systems can have slightly different overheads per file and
    // directory which can lead to flaky tests when testing computed file size.
    // In an effort to mitigate this we calculate the size of an empty directory
    // and file and add it to our expected values.
    before(async () => {
        let dir = `/tmp/diskusage-${uuid.v4()}`;
        fillDir(dir, { count: 0, size: 1 });
        emptyDirSize = await getFolderSize(dir);
        dir = `/tmp/diskusage-${uuid.v4()}`;
        fillDir(dir, { count: 1, size: 1 });
        emptyFileSize = await getFolderSize(dir) - emptyDirSize - 1;
    });

    beforeEach(async () => {
        path = `/tmp/diskusage-${uuid.v4()}`;
        task = new MonitorDiskUsageShim({ warp10: []});
        task._path = path;
        task._enabled = true;
        await task.setup();
    });

    testCases.map(testCase =>
        it(`should calculate disk usage for ${testCase.count} files of ${testCase.size} bytes each`,
            async () => {
                fillDir(path, testCase);
                await task._execute();
                assert.strictEqual(task.usage, testCase.expected + emptyDirSize + (emptyFileSize * testCase.count));
            }));
});
