// bucket schema
const bucketStateKeys = {
    storageUtilized: b => `s3:buckets:${b}:storageUtilized`,
    numberOfObjects: b => `s3:buckets:${b}:numberOfObjects`,
    incomingBytes: b => `s3:buckets:${b}:incomingBytes`,
    outgoingBytes: b => `s3:buckets:${b}:outgoingBytes`,
};

const bucketCounters = {
    storageUtilizedCounter: b => `s3:buckets:${b}:storageUtilized:counter`,
    numberOfObjectsCounter: b => `s3:buckets:${b}:numberOfObjects:counter`,
    incomingBytesCounter: b => `s3:buckets:${b}:incomingBytes:counter`,
    outgoingBytesCounter: b => `s3:buckets:${b}:outgoingBytes:counter`,
    createBucketCounter: b => `s3:buckets:${b}:CreateBucket:counter`,
    deleteBucketCounter: b => `s3:buckets:${b}:DeleteBucket:counter`,
    listBucketCounter: b => `s3:buckets:${b}:ListBucket:counter`,
    getBucketAclCounter: b => `s3:buckets:${b}:GetBucketAcl:counter`,
    putBucketAclCounter: b => `s3:buckets:${b}:PutBucketAcl:counter`,
    listBucketMultipartUploadsCounter: b =>
        `s3:buckets:${b}:ListBucketMultipartUploads:counter`,
    listMultipartUploadPartsCounter: b =>
        `s3:buckets:${b}:ListMultipartUploadParts:counter`,
    initiateMultipartUploadCounter: b =>
        `s3:buckets:${b}:InitiateMultipartUpload:counter`,
    completeMultipartUploadCounter: b =>
        `s3:buckets:${b}:CompleteMultipartUpload:counter`,
    abortMultipartUploadCounter: b =>
        `s3:buckets:${b}:AbortMultipartUpload:counter`,
    deleteObjectCounter: b => `s3:buckets:${b}:DeleteObject:counter`,
    uploadPartCounter: b => `s3:buckets:${b}:UploadPart:counter`,
    getObjectCounter: b => `s3:buckets:${b}:GetObject:counter`,
    getObjectAclCounter: b => `s3:buckets:${b}:GetObjectAcl:counter`,
    putObjectCounter: b => `s3:buckets:${b}:PutObject:counter`,
    putObjectAclCounter: b => `s3:buckets:${b}:PutObjectAcl:counter`,
    headBucketCounter: b => `s3:buckets:${b}:HeadBucket:counter`,
    headObjectCounter: b => `s3:buckets:${b}:HeadObject:counter`,
    listAllMyBucketsCounter: b =>
        `s3:buckets:${b}:ListAllMyBuckets:counter`,
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
    uploadPart: (b, t) => `s3:buckets:${t}:${b}:UploadPart`,
    getObject: (b, t) => `s3:buckets:${t}:${b}:GetObject`,
    getObjectAcl: (b, t) => `s3:buckets:${t}:${b}:GetObjectAcl`,
    putObject: (b, t) => `s3:buckets:${t}:${b}:PutObject`,
    putObjectAcl: (b, t) => `s3:buckets:${t}:${b}:PutObjectAcl`,
    headBucket: (b, t) => `s3:buckets:${t}:${b}:HeadBucket`,
    headObject: (b, t) => `s3:buckets:${t}:${b}:HeadObject`,
    listAllMyBuckets: (b, t) => `s3:buckets:${t}:${b}:ListAllMyBuckets`,
};

/**
* Returns the metric key in schema for the bucket
* @param {string} bucket - bucket name
* @param {string} metric - metric name
* @param {number} timespan - unix timestamp normalized to the date
* @return {string} - schema key
*/
export function genBucketKey(bucket, metric, timespan) {
    return bucketKeys[metric](bucket, timespan);
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
* @param {number} timespan - normalized timespan reduced to the day
* @return {string[]} - list of keys
*/
export function getBucketKeys(bucket, timespan) {
    return Object.keys(bucketKeys)
        .map(item => bucketKeys[item](bucket, timespan));
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
