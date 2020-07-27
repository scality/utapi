/**
 * Converts the given UNIX timestamp to microsecond precision
 * @param {Number} timestamp - timestamp to pad
 * @returns {Number} - Padded timestamp
 */
function convertTimestamp(timestamp) {
    if (timestamp < 10000000000) { // Second precision
        return timestamp * 1000000;
    }
    if (timestamp < 10000000000000) { // Millisecond precision
        return timestamp * 1000;
    }
    return timestamp;
}

module.exports = {
    convertTimestamp,
};
