const assert = require('assert');
const uuid = require('uuid');
const fs = require('fs');

const { MonitorDiskUsage } = require('../../../../libV2/tasks');

class MonitorDiskUsageShim extends MonitorDiskUsage {
    async _getUsage() {
        this.usage = await super._getUsage();
        return this.usage;
    }
}

function fillDir(path, { count, size }) {
    fs.mkdirSync(path);
    const data = Buffer.alloc(size);
    for (let i = 0; i < count; i += 1) {
        fs.writeFileSync(`${path}/${i}`, data);
    }
}

const testCases = [
    { count: 1, size: 100, expected: 160 },
    { count: 2, size: 200, expected: 480 },
    { count: 3, size: 150, expected: 550 },
    { count: 4, size: 111, expected: 564 },
    { count: 100, size: 1024 * 1024, expected: 104859640 },
];

// eslint-disable-next-line func-names
describe('Test MonitorDiskUsage', () => {
    let task;
    let path;

    beforeEach(async () => {
        path = `/tmp/diskusage-${uuid.v4()}`;
        task = new MonitorDiskUsageShim();
        task._path = path;
        task._enabled = true;
        await task.setup();
    });

    testCases.map(testCase =>
        it(`should calculate disk usage for ${testCase.count} files of ${testCase.size} bytes each`,
            async () => {
                fillDir(path, testCase);
                await task._execute();
                assert.strictEqual(task.usage, testCase.expected);
            }));
});
