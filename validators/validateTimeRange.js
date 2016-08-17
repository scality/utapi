/**
* Validate timeRange parameter
* @param {number[]} timeRange - array of bucket names
* @return {boolean} - validation result
*/
export default function validateTimeRange(timeRange) {
    return Array.isArray(timeRange) && timeRange.length > 0
        && timeRange.length < 3
        && timeRange.every(item => typeof item === 'number');
}
