import Validator from './Validator';

/**
 * Get the validator for a particular metric type
 * @param {string} metricType - metric type (e.g., 'buckets', 'accounts')
 * @param {object} dict - Input fields for route
 * @param {boolean} [isRecentListing] - `true` if the route is for listing
 * recent metrics, otherwise `undefined`
 * @return {Validator} Return the created validator
 */
function getValidator(metricType, dict, isRecentListing) {
    // Do not validate time ranges for recent listings because Utapi creates it
    const obj = isRecentListing ? {} : { timeRange: true };
    obj[metricType] = true;
    return new Validator(obj, dict);
}

/**
 * Function to create a validator for route POST /buckets?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
export function validateBucketsListMetrics(dict) {
    return getValidator('buckets', dict);
}

/**
* Function to create a validator for route POST
* /buckets?Action=ListRecentMetrics
* @param {object} dict - Input fields for route
* @return {function} the return value of `getValidator`
*/
export function validateBucketsListRecentMetrics(dict) {
    return getValidator('buckets', dict, true);
}

/**
 * Function to create a validator for route POST /accounts?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
export function validateAccountsListMetrics(dict) {
    return getValidator('accounts', dict);
}

/**
* Function to create a validator for route POST
* /accounts?Action=ListRecentMetrics
* @param {object} dict - Input fields for route
* @return {function} the return value of `getValidator`
*/
export function validateAccountsListRecentMetrics(dict) {
    return getValidator('accounts', dict, true);
}
