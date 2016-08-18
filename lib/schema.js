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
    bucketStorageUtilizedCounter: bucket =>
        `s3:buckets:${bucket}:storageUtilized:counter`,
    bucketIncomingBytesCounter: bucket =>
        `s3:buckets:${bucket}:incomingBytes:counter`,
    bucketOutgoingBytesCounter: bucket =>
        `s3:buckets:${bucket}:outgoingBytes:counter`,
    bucketNumberOfObjectsCounter: bucket =>
        `s3:buckets:${bucket}:numberOfObjects:counter`,
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
