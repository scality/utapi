// bucket schema
const bucketKeys = {
    storageUtilized: bucket => `s3:buckets:${bucket}:storageUtilized`,
    incomingBytes: bucket => `s3:buckets:${bucket}:incomingBytes`,
    outgoingBytes: bucket => `s3:buckets:${bucket}:outgoingBytes`,
    numberOfObjects: bucket => `s3:buckets:${bucket}:numberOfObjects`,
    createBucket: bucket => `s3:buckets:${bucket}:CreateBucket`,
    deleteBucket: bucket => `s3:buckets:${bucket}:DeleteBucket`,
    listBucket: bucket => `s3:buckets:${bucket}:ListBucket`,
    getBucketAcl: bucket => `s3:buckets:${bucket}:GetBucketAcl`,
    putBucketAcl: bucket => `s3:buckets:${bucket}:PutBucketAcl`,
    listBucketMultipartUploads: bucket =>
        `s3:buckets:${bucket}:ListBucketMultipartUploads`,
    listMultipartUploadParts: bucket =>
        `s3:buckets:${bucket}:ListMultipartUploadParts`,
    initiateMultipartUpload: bucket =>
        `s3:buckets:${bucket}:InitiateMultipartUpload`,
    completeMultipartUpload: bucket =>
        `s3:buckets:${bucket}:CompleteMultipartUpload`,
    abortMultipartUpload: bucket =>
        `s3:buckets:${bucket}:AbortMultipartUpload`,
    deleteObject: bucket => `s3:buckets:${bucket}:DeleteObject`,
    uploadPart: bucket => `s3:buckets:${bucket}:UploadPart`,
    getObject: bucket => `s3:buckets:${bucket}:GetObject`,
    getObjectAcl: bucket => `s3:buckets:${bucket}:GetObjectAcl`,
    putObject: bucket => `s3:buckets:${bucket}:PutObject`,
    putObjectAcl: bucket => `s3:buckets:${bucket}:PutObjectAcl`,
    headBucket: bucket => `s3:buckets:${bucket}:HeadBucket`,
    headObject: bucket => `s3:buckets:${bucket}:HeadObject`,
    listAllMyBuckets: bucket => `s3:buckets:${bucket}:ListAllMyBuckets`,
    storageUtilizedCounter: bucket =>
        `s3:buckets:${bucket}:storageUtilized:counter`,
    incomingBytesCounter: bucket =>
        `s3:buckets:${bucket}:incomingBytes:counter`,
    outgoingBytesCounter: bucket =>
        `s3:buckets:${bucket}:outgoingBytes:counter`,
    numberOfObjectsCounter: bucket =>
        `s3:buckets:${bucket}:numberOfObjects:counter`,
    createBucketCounter: bucket => `s3:buckets:${bucket}:CreateBucket:counter`,
    deleteBucketCounter: bucket => `s3:buckets:${bucket}:DeleteBucket:counter`,
    listBucketCounter: bucket => `s3:buckets:${bucket}:ListBucket:counter`,
    getBucketAclCounter: bucket => `s3:buckets:${bucket}:GetBucketAcl:counter`,
    putBucketAclCounter: bucket => `s3:buckets:${bucket}:PutBucketAcl:counter`,
    listBucketMultipartUploadsCounter: bucket =>
        `s3:buckets:${bucket}:ListBucketMultipartUploads:counter`,
    listMultipartUploadPartsCounter: bucket =>
        `s3:buckets:${bucket}:ListMultipartUploadParts:counter`,
    initiateMultipartUploadCounter: bucket =>
        `s3:buckets:${bucket}:InitiateMultipartUpload:counter`,
    completeMultipartUploadCounter: bucket =>
        `s3:buckets:${bucket}:CompleteMultipartUpload:counter`,
    abortMultipartUploadCounter: bucket =>
        `s3:buckets:${bucket}:AbortMultipartUpload:counter`,
    deleteObjectCounter: bucket => `s3:buckets:${bucket}:DeleteObject:counter`,
    uploadPartCounter: bucket => `s3:buckets:${bucket}:UploadPart:counter`,
    getObjectCounter: bucket => `s3:buckets:${bucket}:GetObject:counter`,
    getObjectAclCounter: bucket => `s3:buckets:${bucket}:GetObjectAcl:counter`,
    putObjectCounter: bucket => `s3:buckets:${bucket}:PutObject:counter`,
    putObjectAclCounter: bucket => `s3:buckets:${bucket}:PutObjectAcl:counter`,
    headBucketCounter: bucket => `s3:buckets:${bucket}:HeadBucket:counter`,
    headObjectCounter: bucket => `s3:buckets:${bucket}:HeadObject:counter`,
    listAllMyBucketsCounter: bucket =>
        `s3:buckets:${bucket}:ListAllMyBuckets:counter`,
};

/**
* Returns the metric key in schema for the bucket
* @param {string} bucket - bucket name
* @param {string} metric - metric name
* @return {string} - schema key
*/
export function genBucketKey(bucket, metric) {
    return bucketKeys[metric](bucket);
}

/**
* Returns a list of the global counters for a bucket
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function getBucketGlobalCounters(bucket) {
    const keys = [];
    Object.keys(bucketKeys).forEach(item => {
        if (item.indexOf('Counter') !== -1) {
            keys.push(bucketKeys[item](bucket));
        }
    });
    return keys;
}

/**
* Returns a list of all keys for a bucket
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function getBucketKeys(bucket) {
    return Object.keys(bucketKeys).map(item => bucketKeys[item](bucket));
}

/**
* Returns metric from key
* @param {string} key - schema key
* @param {string} bucket - bucket name
* @return {string} metric - S3 metric
*/
export function getMetricFromKey(key, bucket) {
    return key.replace(`s3:buckets:${bucket}:`, '');
}
