// bucket schema
const bucketStateKeys = {
    storageUtilized: b => `s3:buckets:${b}:storageUtilized`,
    numberOfObjects: b => `s3:buckets:${b}:numberOfObjects`,
};

const bucketCounters = {
    storageUtilizedCounter: b => `s3:buckets:${b}:storageUtilized:counter`,
    numberOfObjectsCounter: b => `s3:buckets:${b}:numberOfObjects:counter`,
};

const bucketKeys = {
    createBucket: (b, t) => `s3:buckets:${t}:${b}:CreateBucket`,
    deleteBucket: (b, t) => `s3:buckets:${t}:${b}:DeleteBucket`,
    listBucket: (b, t) => `s3:buckets:${t}:${b}:ListBucket`,
    getBucketAcl: (b, t) => `s3:buckets:${t}:${b}:GetBucketAcl`,
    putBucketAcl: (b, t) => `s3:buckets:${t}:${b}:PutBucketAcl`,
    listBucketMultipartUploads: (b, t) =>
        `s3:buckets:${t}:${b}:ListBucketMultipartUploads`,
    listMultipartUploadParts: (b, t) =>
        `s3:buckets:${t}:${b}:ListMultipartUploadParts`,
    initiateMultipartUpload: (b, t) =>
        `s3:buckets:${t}:${b}:InitiateMultipartUpload`,
    completeMultipartUpload: (b, t) =>
        `s3:buckets:${t}:${b}:CompleteMultipartUpload`,
    abortMultipartUpload: (b, t) =>
        `s3:buckets:${t}:${b}:AbortMultipartUpload`,
    deleteObject: (b, t) => `s3:buckets:${t}:${b}:DeleteObject`,
    multiObjectDelete: (b, t) => `s3:buckets:${t}:${b}:MultiObjectDelete`,
    uploadPart: (b, t) => `s3:buckets:${t}:${b}:UploadPart`,
    getObject: (b, t) => `s3:buckets:${t}:${b}:GetObject`,
    getObjectAcl: (b, t) => `s3:buckets:${t}:${b}:GetObjectAcl`,
    putObject: (b, t) => `s3:buckets:${t}:${b}:PutObject`,
    copyObject: (b, t) => `s3:buckets:${t}:${b}:CopyObject`,
    putObjectAcl: (b, t) => `s3:buckets:${t}:${b}:PutObjectAcl`,
    headBucket: (b, t) => `s3:buckets:${t}:${b}:HeadBucket`,
    headObject: (b, t) => `s3:buckets:${t}:${b}:HeadObject`,
    incomingBytes: (b, t) => `s3:buckets:${t}:${b}:incomingBytes`,
    outgoingBytes: (b, t) => `s3:buckets:${t}:${b}:outgoingBytes`,
};

/**
* Returns the metric key in schema for the bucket
* @param {string} bucket - bucket name
* @param {string} metric - metric name
* @param {number} timestamp - unix timestamp normalized to the nearest 15 min.
* @return {string} - schema key
*/
export function genBucketKey(bucket, metric, timestamp) {
    return bucketKeys[metric](bucket, timestamp);
}

/**
* Returns a list of the counters for a bucket
* @param {string} bucket - bucket name
* @return {string[]} - array of keys for counters
*/
export function getBucketCounters(bucket) {
    return Object.keys(bucketCounters).map(
        item => bucketCounters[item](bucket));
}

/**
* Returns a list of all keys for a bucket
* @param {string} bucket - bucket name
* @param {number} timestamp - unix timestamp normalized to the nearest 15 min.
* @return {string[]} - list of keys
*/
export function getBucketKeys(bucket, timestamp) {
    return Object.keys(bucketKeys)
        .map(item => bucketKeys[item](bucket, timestamp));
}

/**
* Returns metric from key
* @param {string} key - schema key
* @param {string} bucket - bucket name
* @return {string} metric - S3 metric
*/
export function getMetricFromKey(key, bucket) {
    // s3:buckets:1473451689898:demo:putObject
    return key.slice(25).replace(`${bucket}:`, '');
}

/**
* Returns the keys representing state of the bucket
* @param {string} bucket - bucket name
* @return {string[]} - list of keys
*/
export function getBucketStateKeys(bucket) {
    return Object.keys(bucketStateKeys)
        .map(item => bucketStateKeys[item](bucket));
}

/**
* Returns the state metric key in schema for the bucket
* @param {string} bucket - bucket name
* @param {string} metric - metric name
* @return {string} - schema key
*/
export function genBucketStateKey(bucket, metric) {
    return bucketStateKeys[metric](bucket);
}

export function genBucketCounter(bucket, metric) {
    return bucketCounters[metric](bucket);
}
