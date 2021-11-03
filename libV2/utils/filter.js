const assert = require('assert');

/**
 * filterObject
 *
 * Constructs a function meant for filtering Objects by the value of a key
 * Returned function returns a boolean with false meaning the object was present
 * in the filter allowing the function to be passed directly to Array.filter etc.
 *
 * @param {string} key - Object key to inspect
 * @param {Object} filter
 * @param {Set} [filter.allow] - Set containing keys to include
 * @param {Set} [filter.deny] - Set containing keys to not include
 * @returns {bool}
 */

function filterObject(key, { allow, deny }) {
    if (allow && deny) {
        throw new Error('You can not define both an allow and a deny list.');
    }
    if (!allow && !deny) {
        throw new Error('You must define either an allow or a deny list.');
    }
    if (allow) {
        assert(allow instanceof Set);
        return obj => (obj[key] === undefined) || allow.has(obj[key]);
    }
    assert(deny instanceof Set);
    return obj => (obj[key] === undefined) || !deny.has(obj[key]);
}

/**
 * buildFilterChain
 *
 * Constructs a function chain from a map of key names and allow/deny filters.
 * Returned function returns a boolean with false meaning the object was present
 * in one of the filters allowing the function to be passed directly to Array.filter etc.
 *
 * @param {Object<string, Object<string, Set>} filters
 * @returns {function(Object): bool}
 */

function buildFilterChain(filters) {
    return Object.entries(filters)
        .reduce(
            (chain, [key, filter]) => {
                const filterFunc = filterObject(key, filter);
                return obj => filterFunc(obj) && chain(obj);
            },
            () => true,
        );
}

module.exports = { filterObject, buildFilterChain };
