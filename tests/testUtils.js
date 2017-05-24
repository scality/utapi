const { getKeys, getCounters } = require('../lib/schema');

const resouceTypes = ['buckets', 'accounts', 'service'];
const propertyNames = {
    buckets: 'bucket',
    accounts: 'accountId',
};
const resources = {
    buckets: 'foo-bucket',
    accounts: 'foo-account',
};

function getNormalizedTimestamp() {
    const d = new Date();
    const minutes = d.getMinutes();
    return d.setMinutes((minutes - minutes % 15), 0, 0);
}

// Build the resouceType object that gets keys from the schema.
function _getResourceTypeObject(resourceType) {
    const obj = { level: resourceType, service: 's3' };
    if (resourceType !== 'service') {
        obj[propertyNames[resourceType]] = resources[resourceType];
    }
    return obj;
}

// Get all keys for each resource type from the schema.
function getAllResourceTypeKeys() {
    const timestamp = getNormalizedTimestamp(Date.now());
    const allResourceTypeKeys = resouceTypes.map(resourceType => {
        const obj = _getResourceTypeObject(resourceType);
        const counters = getCounters(obj);
        const keys = getKeys(obj, timestamp);
        return counters.concat(keys);
    });
    // Concatenate each array of resourceType keys into one single array.
    return [].concat.apply([], allResourceTypeKeys);
}

module.exports = {
    getAllResourceTypeKeys,
    getNormalizedTimestamp,
};
