/**
* Validate timeRange parameter
* @param {number[]} timeRange - array of bucket names
* @return {boolean} - validation result
*/
function validateTimeRange(timeRange) {
    if (Array.isArray(timeRange) && timeRange.length > 0 && timeRange.length < 3
        && timeRange.every(item => typeof item === 'number')) {
        // check for start time
        const t0 = new Date(timeRange[0]);
        const min0 = t0.getMinutes();
        const sec0 = t0.getSeconds();
        const ms0 = t0.getMilliseconds();
        if (min0 !== 0 && min0 !== 15 && min0 !== 30 && min0 !== 45) {
            return false;
        }
        if (sec0 !== 0) {
            return false;
        }
        if (ms0 !== 0) {
            return false;
        }

        // check for end time
        if (timeRange[1] !== undefined) {
            const t1 = new Date(timeRange[1]);
            const min1 = t1.getMinutes();
            const sec1 = t1.getSeconds();
            const ms1 = t1.getMilliseconds();
            if ((min1 !== 14 && min1 !== 29 && min1 !== 44 && min1 !== 59)) {
                return false;
            }
            if (sec1 !== 59) {
                return false;
            }
            if (ms1 !== 999) {
                return false;
            }
        }

        if (timeRange[0] > timeRange[1]) {
            return false;
        }
        return true;
    }
    return false;
}

module.exports = validateTimeRange;
