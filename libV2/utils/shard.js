const config = require('../config');

/**
 * Returns a unix style timestamp converted to a configurable resolution
 * Represents a timespan of interval size ending at the returned value.
 * @param {Number} timestamp - Unix timestamp with millisecond/microsecond resolution
 * @returns {Number} - Unix timestamp representing beginning of shard
 */
function shardFromTimestamp(timestamp) {
    let interval = config.ingestionShardSize * 1000;
    if (timestamp > 1000000000000000) { // handle microsecond resolution
        interval = config.ingestionShardSize * 1000000;
    }

    return Math.ceil(timestamp / interval) * interval;
}

module.exports = {
    shardFromTimestamp,
};
