/**
* Validate a metricType parameter
* @param {string[]} metricType - array of metric names
* @return {boolean} - validation result
*/
function validateMetric(metricType) {
    return Array.isArray(metricType) && metricType.length > 0
        && metricType.every(item => typeof item === 'string');
}

module.exports = validateMetric;
