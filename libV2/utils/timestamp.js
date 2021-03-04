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

class InterpolatedClock {
    constructor() {
        this._now = null;
        this._step = 1;
    }

    getTs(timestamp) {
        const ts = timestamp !== undefined ? timestamp : Date.now();
        if (ts === this._now) {
            // If this is the same millisecond as the last call
            this._step += 1;
            return convertTimestamp(ts) + (this._step - 1);
        }
        this._now = ts;
        this._step = 1;
        return convertTimestamp(ts);
    }
}

/**
 * Returns the current time as
 * the number of microseconds since the epoch
 *
 * @returns {Number} - current timestamp
 */
function now() {
    return Date.now() * 1000;
}

/**
 * Slice the time range represented by the passed timestamps
 * into slices of at most `step` duration.
 *
 * Both `start` and `end` are included in the returned slices.
 * Slice timestamps are inclusive and non overlapping.
 *
 * For example sliceTimeRange(0, 5, 2) will yield
 * [0, 1]
 * [2, 3]
 * [4, 5]
 *
 * @param {Number} start
 * @param {Number} end
 * @param {Number} step
 */

function* sliceTimeRange(start, end, step) {
    let spos = start;
    let epos = start + step - 1;
    while (epos < end) {
        yield [spos, epos];
        spos += step;
        epos += step;
    }
    yield [spos, end];
}

module.exports = {
    convertTimestamp,
    InterpolatedClock,
    now,
    sliceTimeRange,
};
