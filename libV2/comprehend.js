/**
 *
 * @param {Array|Object} data - data to reduce
 * @param {function(string, [string])} func - Called with the index/key and value for each entry in the input
 *                                            Array or Object. Expected to return { key, value };
 * @returns {Object} - Resulting object
 */
function comprehend(data, func) {
    const _data = Array.isArray(data) ? data.entries() : Object.entries(data);
    return _data.reduce((prev, [key, value]) => {
        const { _key, _value } = func(key, value);
        prev[_key] = _value;
        return prev;
    }, {});
}

module.exports = comprehend;
