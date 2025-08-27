/**
 * Promisifies a function. If the function already returns a promise,
 * it returns it as is. Handles both callbacks and promises.
 *
 * @param {Function} originalFn The function to promisify.
 * @returns {Function} A function that returns a promise.
 */
module.exports = function flexiblePromisify(originalFn) {
    // Check if the function provides a custom promise-based version.
    // This is the same mechanism Node's util.promisify uses.
    const customPromisified = originalFn[Symbol.for('nodejs.util.promisify.custom')];
    if (typeof customPromisified === 'function') {
        return customPromisified;
    }

    // Return the new promise-based wrapper function.
    return function flexiblePromisifiedWrapper(...args) {
        const thisCtx = this;

        return new Promise((resolve, reject) => {
            // 1. Callback will be used if `originalFn` is a callback-style function.
            function callback(err, result) {
                if (err) {
                    return reject(err);
                }
                return resolve(result);
            }

            // 2. Call the originalFn, with user's args AND our custom callback.
            const potentialPromise = originalFn.apply(thisCtx, [...args, callback]);

            // 3. If originalFn returned a promise, we use its result and ignore the callback.
            if (potentialPromise && typeof potentialPromise.then === 'function') {
                // The function returned a promise. We'll trust it as the source of truth.
                potentialPromise.then(resolve, reject);
            }

            // If the function did NOT return a promise (i.e., it's a standard callback function),
            // then our promise is already wired up to be resolved or rejected by the `callback` we passed in.
        });
    };
};
