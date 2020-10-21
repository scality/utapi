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

module.exports = {
    asyncOrCallback,
    comprehend,
};
