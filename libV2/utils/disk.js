
const diskSpecRegex = /(\d+)([bkmgtxz])(i?b)?/;
const suffixToExp = {
    b: 0,
    k: 1,
    m: 2,
    g: 3,
    t: 4,
    x: 5,
    z: 6,
};

/**
 * Converts a string specifying disksize into its value in bytes
 * Supported formats:
 *  1b/1B - Directly specify a byte size
 *  1K/1MB/1GiB - Specify a number of bytes using SI or common suffixes
 *
 * Suffixes are case insensitive.
 * All suffixes are considered SI standard with 1 kilobyte being 1024 bytes.
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

module.exports = {
    parseDiskSizeSpec,
};
