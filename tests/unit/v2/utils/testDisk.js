const { describe } = require('@hapi/joi/lib/manifest');
const assert = require('assert');
const { parseDiskSizeSpec, getFolderSize, formatDiskSize } = require('../../../../libV2/utils/disk');

const sizeSpecTestCases = [
    ['1B', 1],
    ['2K', 2048],
    ['3KB', 3072],
    ['4KiB', 4096],
    ['5mib', 5242880],
    ['1gb', 1073741824],
    ['2t', 2199023255552],
    ['3pb', 3377699720527872],
];

describe('test parseDiskSizeSpec', () => {
    sizeSpecTestCases.map(([input, expected]) => {
        it(`should convert ${input} to ${expected} bytes`, () =>
            assert.strictEqual(parseDiskSizeSpec(input), expected));
    });
});

describe('test formatDiskSize', () => {
    it('should format bytes as a human readable string', () => {
        assert.strictEqual(formatDiskSize(1024), '1.0KiB');
    });
});
