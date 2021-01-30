const { callbackify } = require('util');

/**
 *  Convenience function to handle "if no callback then return a promise" pattern
 *
 * @param {Function} asyncFunc - asyncFunction to call
 * @param {Function|undefined} callback - optional callback
 * @returns {Promise|undefined} - returns a Promise if no callback is passed
 */
function asyncOrCallback(asyncFunc, callback) {
    if (typeof callback === 'function') {
        callbackify(asyncFunc)(callback);
        return undefined;
    }
    return asyncFunc();
}

/**
 *
 * @param {Array|Object} data - data to reduce
 * @param {function(string, [string])} func - Called with the index/key and value for each entry in the input
 *                                            Array or Object. Expected to return { key, value };
 * @returns {Object} - Resulting object
 */
function comprehend(data, func) {
    return Object.entries(data).reduce((prev, [key, value]) => {
        const { key: _key, value: _value } = func(key, value);
        prev[_key] = _value;
        return prev;
    }, {});
}

/**
 * Calls func with items in sequence, advancing if an error is thrown.
 * The result from the first successful call is returned.
 *
 * onError, if passed, is called on every error thrown by func;
 *
 * @param {Array} items - items to iterate
 * @param {AsyncFunction} func - function to apply to each item
 * @param {Function|undefined} onError - optional function called if an error is thrown
 * @returns {*} -
 */
async function iterIfError(items, func, onError) {
    // eslint-disable-next-line no-restricted-syntax
    for (const item of items) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const resp = await func(item);
            return resp;
        } catch (error) {
            if (onError) {
                onError(error);
            }
        }
    }
    throw new Error('unable to complete request');
}

module.exports = {
    asyncOrCallback,
    comprehend,
    iterIfError,
};
