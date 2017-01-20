import Validator from './Validator';

/**
 * Get the validator for a particular metric type
 * @param {string} metricType - metric type (e.g., 'buckets', 'accounts')
 * @param {object} dict - Input fields for route
 * @return {Validator} Return the created validator
 */
function getValidator(metricType, dict) {
    const obj = {};
    obj.timeRange = true;
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
 * Function to create a validator for route POST /accounts?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
export function validateAccountsListMetrics(dict) {
    return getValidator('accounts', dict);
}

/**
 * Function to create a validator for route POST /users?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
export function validateUsersListMetrics(dict) {
    return getValidator('users', dict);
}

/**
 * Function to create a validator for route POST /service?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
export function validateServiceListMetrics(dict) {
    return getValidator('service', dict);
}
