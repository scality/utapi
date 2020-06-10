/**
 * Returns a unix style timestamp floored to 10 second resolution
 * @param {Number} timestamp - Unix timestamp with millisecond resolution
 * @returns {Number} - Unix timestamp representing beginning of shard
 */
function shardFromTimestamp(timestamp) {
    return timestamp - (timestamp % 10000);
}

module.exports = {
    shardFromTimestamp,
};
