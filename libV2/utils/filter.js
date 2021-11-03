function filterObject(key, { allow, deny }) {
    if (allow && deny) {
        throw new Error('You can not define both an allow and a deny list.');
    }
    if (!allow && !deny) {
        throw new Error('You must define either an allow or a deny list.');
    }
    if (allow) {
        return obj => (obj[key] === undefined) || allow.has(obj[key]);
    }
    return obj => (obj[key] === undefined) || !deny.has(obj[key]);
}

module.exports = { filterObject };
