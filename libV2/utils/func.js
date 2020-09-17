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

module.exports = {
    asyncOrCallback,
};
