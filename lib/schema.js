// metric type schema
const stateKeys = {
    storageUtilized: prefix => `${prefix}storageUtilized`,
    numberOfObjects: prefix => `${prefix}numberOfObjects`,
};

const counters = {
    storageUtilizedCounter: prefix => `${prefix}storageUtilized:counter`,
    numberOfObjectsCounter: prefix => `${prefix}numberOfObjects:counter`,
};

const keys = {
    createBucket: prefix => `${prefix}CreateBucket`,
    deleteBucket: prefix => `${prefix}DeleteBucket`,
    listBucket: prefix => `${prefix}ListBucket`,
    getBucketAcl: prefix => `${prefix}GetBucketAcl`,
    putBucketAcl: prefix => `${prefix}PutBucketAcl`,
    putBucketCors: prefix => `${prefix}PutBucketCors`,
    deleteBucketCors: prefix => `${prefix}DeleteBucketCors`,
    getBucketCors: prefix => `${prefix}GetBucketCors`,
    putBucketWebsite: prefix => `${prefix}PutBucketWebsite`,
    putBucketVersioning: prefix => `${prefix}PutBucketVersioning`,
    getBucketVersioning: prefix => `${prefix}GetBucketVersioning`,
    deleteBucketWebsite: prefix => `${prefix}DeleteBucketWebsite`,
    getBucketWebsite: prefix => `${prefix}GetBucketWebsite`,
    getBucketLocation: prefix => `${prefix}GetBucketLocation`,
    listBucketMultipartUploads: prefix => `${prefix}ListBucketMultipartUploads`,
    listMultipartUploadParts: prefix => `${prefix}ListMultipartUploadParts`,
    initiateMultipartUpload: prefix => `${prefix}InitiateMultipartUpload`,
    completeMultipartUpload: prefix => `${prefix}CompleteMultipartUpload`,
    abortMultipartUpload: prefix => `${prefix}AbortMultipartUpload`,
    deleteObject: prefix => `${prefix}DeleteObject`,
    multiObjectDelete: prefix => `${prefix}MultiObjectDelete`,
    uploadPart: prefix => `${prefix}UploadPart`,
    getObject: prefix => `${prefix}GetObject`,
    getObjectAcl: prefix => `${prefix}GetObjectAcl`,
    getObjectTagging: prefix => `${prefix}GetObjectTagging`,
    putObject: prefix => `${prefix}PutObject`,
    copyObject: prefix => `${prefix}CopyObject`,
    putObjectAcl: prefix => `${prefix}PutObjectAcl`,
    putObjectTagging: prefix => `${prefix}PutObjectTagging`,
    deleteObjectTagging: prefix => `${prefix}DeleteObjectTagging`,
    headBucket: prefix => `${prefix}HeadBucket`,
    headObject: prefix => `${prefix}HeadObject`,
    putBucketReplication: prefix => `${prefix}PutBucketReplication`,
    getBucketReplication: prefix => `${prefix}GetBucketReplication`,
    deleteBucketReplication: prefix => `${prefix}DeleteBucketReplication`,
    incomingBytes: prefix => `${prefix}incomingBytes`,
    outgoingBytes: prefix => `${prefix}outgoingBytes`,
};

/**
* Creates the appropriate prefix for schema keys
* @param {object} params - object with metric type and id as a property
* @param {number} [timestamp] - (optional) unix timestamp normalized to the
* nearest 15 min.
* @return {string} - prefix for the schema key
*/
function getSchemaPrefix(params, timestamp) {
    const { bucket, accountId, userId, level, service } = params;
    // `service` property must remain last because other objects also include it
    const id = bucket || accountId || userId || service;
    const prefix = timestamp ? `${service}:${level}:${timestamp}:${id}:` :
        `${service}:${level}:${id}:`;
    return prefix;
}

/**
* Returns the metric key for the metric type
* @param {object} params - object with metric type and id as a property
* @param {string} metric - metric to generate a key for
* @param {number} timestamp - unix timestamp normalized to the nearest 15 min.
* @return {string} - schema key
*/
function generateKey(params, metric, timestamp) {
    const prefix = getSchemaPrefix(params, timestamp);
    return keys[metric](prefix);
}

/**
* Returns a list of the counters for a metric type
* @param {object} params - object with metric type and id as a property
* @return {string[]} - array of keys for counters
*/
function getCounters(params) {
    const prefix = getSchemaPrefix(params);
    return Object.keys(counters).map(item => counters[item](prefix));
}

/**
* Returns a list of all keys for a metric type
* @param {object} params - object with metric type and id as a property
* @param {number} timestamp - unix timestamp normalized to the nearest 15 min.
* @return {string[]} - list of keys
*/
function getKeys(params, timestamp) {
    const prefix = getSchemaPrefix(params, timestamp);
    return Object.keys(keys).map(item => keys[item](prefix));
}

/**
* Returns metric from key
* @param {string} key - schema key
* @return {string} metric - Utapi metric
*/
function getMetricFromKey(key) {
    const fields = key.split(':');
    // Identify the location of the metric in the array.
    const metricLocation = key.includes('counter') ? -2 : -1;
    return fields[fields.length + metricLocation];
}

/**
* Returns the keys representing state of the metric type
* @param {object} params - object with metric type and id as a property
* @return {string[]} - list of keys
*/
function getStateKeys(params) {
    const prefix = getSchemaPrefix(params);
    return Object.keys(stateKeys).map(item => stateKeys[item](prefix));
}

/**
* Returns the state metric key for the metric type
* @param {object} params - object with metric type and id as a property
* @param {string} metric - metric to generate a key for
* @return {string} - schema key
*/
function generateStateKey(params, metric) {
    const prefix = getSchemaPrefix(params);
    return stateKeys[metric](prefix);
}

/**
* Returns the counter metric key for the metric type
* @param {object} params - object with metric type and id as a property
* @param {string} metric - metric to generate a key for
* @return {string} - schema key
*/
function generateCounter(params, metric) {
    const prefix = getSchemaPrefix(params);
    return counters[metric](prefix);
}

module.exports = {
    getCounters,
    getKeys,
    getMetricFromKey,
    getStateKeys,
    generateCounter,
    generateKey,
    generateStateKey,
};
