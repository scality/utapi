/**
* Validate buckets parameter
* @param {string[]} buckets - array of bucket names
* @return {boolean} - validation result
*/
export default function validateBuckets(buckets) {
    return Array.isArray(buckets) && buckets.length > 0
        && buckets.every(item => typeof item === 'string');
}
