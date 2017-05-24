const Validator = require('./Validator');

/**
 * Get the validator for a particular metric type
 * @param {string} metricType - metric type (e.g., 'buckets', 'accounts')
 * @param {object} dict - Input fields for route
 * @param {boolean} [isRecentListing] - `true` if the route is for listing
 * recent metrics (i.e., list the metrics starting from the second most recent
 * fifteen minute timestamp), otherwise `undefined`
 * @return {Validator} Return the created validator
 */
function getValidator(metricType, dict, isRecentListing) {
    // Do not validate time ranges for recent listings because we create the
    // recent listing timerange in ListMetrics::getRecentTypesMetrics
    const obj = isRecentListing ? {} : { timeRange: true };
    obj[metricType] = true;
    return new Validator(obj, dict);
}

/**
 * Function to create a validator for route POST /buckets?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateBucketsListMetrics(dict) {
    return getValidator('buckets', dict);
}

/**
 * Function to create a validator for route POST
 * /buckets?Action=ListRecentMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateBucketsListRecentMetrics(dict) {
    return getValidator('buckets', dict, true);
}

/**
 * Function to create a validator for route POST /accounts?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateAccountsListMetrics(dict) {
    return getValidator('accounts', dict);
}

/**
 * Function to create a validator for route POST
 * /accounts?Action=ListRecentMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateAccountsListRecentMetrics(dict) {
    return getValidator('accounts', dict, true);
}

/**
 * Function to create a validator for route POST /users?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateUsersListMetrics(dict) {
    return getValidator('users', dict);
}

/**
 * Function to create a validator for route POST
 * /users?Action=ListRecentMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateUsersListRecentMetrics(dict) {
    return getValidator('users', dict, true);
}

/**
 * Function to create a validator for route POST /service?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateServiceListMetrics(dict) {
    return getValidator('service', dict);
}

/**
 * Function to create a validator for route POST
 * /service?Action=ListRecentMetrics
 * @param {object} dict - Input fields for route
 * @return {function} the return value of `getValidator`
 */
function validateServiceListRecentMetrics(dict) {
    return getValidator('service', dict, true);
}

module.exports = {
    validateBucketsListMetrics,
    validateBucketsListRecentMetrics,
    validateAccountsListMetrics,
    validateAccountsListRecentMetrics,
    validateUsersListMetrics,
    validateUsersListRecentMetrics,
    validateServiceListMetrics,
    validateServiceListRecentMetrics,
};
