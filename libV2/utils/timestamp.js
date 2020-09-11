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

    getTs() {
        const ts = new Date().getTime();
        if (ts === this._now) {
            // If this is the same millisecond as the last call
            this._step += 1;
            return ts * 1000 + (this._step - 1);
        }
        this._now = ts;
        this._step = 1;
        return ts * 1000;
    }
}

/**
 * Returns the current time as
 * the number of microseconds since the epoch
 *
 * @returns {Number} - current timestamp
 */
function now() {
    return new Date().getTime() * 1000;
}

module.exports = {
    convertTimestamp,
    InterpolatedClock,
    now,
};
