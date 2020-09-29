const config = require('../config');

/**
 * Returns a unix style timestamp floored to 10 second resolution
 * @param {Number} timestamp - Unix timestamp with millisecond/microsecond resolution
 * @returns {Number} - Unix timestamp representing beginning of shard
 */
function shardFromTimestamp(timestamp) {
    let interval = config.ingestionShardSize * 1000;
    if (timestamp > 1000000000000000) { // handle microsecond resolution
        interval = config.ingestionShardSize * 1000000;
    }
    return timestamp - (timestamp % interval);
}

module.exports = {
    shardFromTimestamp,
};
