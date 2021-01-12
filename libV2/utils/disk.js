const { promisify } = require('util');
const getFolderSize = require('get-folder-size');
const byteSize = require('byte-size');

const diskSpecRegex = /(\d+)([bkmgtpxz])(i?b)?/;
const suffixToExp = {
    b: 0,
    k: 1,
    m: 2,
    g: 3,
    t: 4,
    p: 5,
    x: 6,
    z: 7,
};

/**
 * Converts a string specifying disk size into its value in bytes
 * Supported formats:
 *  1b/1B - Directly specify a byte size
 *  1K/1MB/1GiB - Specify a number of bytes using IEC or common suffixes
 *
 * Suffixes are case insensitive.
 * All suffixes are considered IEC standard with 1 kibibyte being 2^10 bytes.
 *
 * @param {String} spec - string for conversion
 * @returns {Integer} - disk size in bytes
 */
function parseDiskSizeSpec(spec) {
    const normalized = spec.toLowerCase();
    if (!diskSpecRegex.test(normalized)) {
        throw Error('Format does not match a known suffix');
    }

    const match = diskSpecRegex.exec(normalized);
    const size = parseInt(match[1], 10);
    const exponent = suffixToExp[match[2]];
    return size * (1024 ** exponent);
}

function _formatFunc() {
    return `${this.value}${this.unit}`;
}

function formatDiskSize(value) {
    return byteSize(value, { units: 'iec', toStringFn: _formatFunc }).toString();
}

module.exports = {
    parseDiskSizeSpec,
    getFolderSize: promisify(getFolderSize),
    formatDiskSize,
};
