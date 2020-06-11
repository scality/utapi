/**
 * Returns a unix style timestamp floored to 10 second resolution
 * @param {Number} timestamp - Unix timestamp with millisecond resolution
 * @returns {Number} - Unix timestamp representing beginning of shard
 */
function shardFromTimestamp(timestamp) {
    // Do this with string manipulation to avoid float errors
    return parseInt(`${timestamp.toString().slice(0, -4)}0000`, 10);
}

module.exports = {
    shardFromTimestamp,
};
