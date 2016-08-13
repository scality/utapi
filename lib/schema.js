/**
* storageUtilized key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketStorageUtilized(bucket) {
    return `s3:buckets:${bucket}:storageUtilized`;
}

/**
* incomingBytes key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketIncomingBytes(bucket) {
    return `s3:buckets:${bucket}:incomingBytes`;
}

/**
* outgoingBytes key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketOutgoingBytes(bucket) {
    return `s3:buckets:${bucket}:outgoingBytes`;
}

/**
* NumberOfObjects key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketNumberOfObjects(bucket) {
    return `s3:buckets:${bucket}:numberOfObjects`;
}

/**
* createBucket key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function createBucket(bucket) {
    return `s3:buckets:${bucket}:CreateBucket`;
}

/**
* deleteBucket key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function deleteBucket(bucket) {
    return `s3:buckets:${bucket}:DeleteBucket`;
}

/**
* listBucket key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function listBucket(bucket) {
    return `s3:buckets:${bucket}:ListBucket`;
}

/**
* getBucketAcl key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function getBucketAcl(bucket) {
    return `s3:buckets:${bucket}:GetBucketAcl`;
}

/**
* putBucketAcl key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function putBucketAcl(bucket) {
    return `s3:buckets:${bucket}:PutBucketAcl`;
}

/**
* listBucketMultipartUploads key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function listBucketMultipartUploads(bucket) {
    return `s3:buckets:${bucket}:ListBucketMultipartUploads`;
}

/**
* listMultipartUploadParts key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function listMultipartUploadParts(bucket) {
    return `s3:buckets:${bucket}:ListMultipartUploadParts`;
}

/**
* abortMultipartUpload key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function abortMultipartUpload(bucket) {
    return `s3:buckets:${bucket}:AbortMultipartUpload`;
}

/**
* deleteObject key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function deleteObject(bucket) {
    return `s3:buckets:${bucket}:DeleteObject`;
}

/**
* uploadPart key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function uploadPart(bucket) {
    return `s3:buckets:${bucket}:UploadPart`;
}

/**
* getObject key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function getObject(bucket) {
    return `s3:buckets:${bucket}:GetObject`;
}

/**
* getObjectAcl key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function getObjectAcl(bucket) {
    return `s3:buckets:${bucket}:GetObjectAcl`;
}

/**
* putObject key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function putObject(bucket) {
    return `s3:buckets:${bucket}:PutObject`;
}

/**
* putObjectAcl key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function putObjectAcl(bucket) {
    return `s3:buckets:${bucket}:PutObjectAcl`;
}

/**
* listAllMyBuckets key
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function listAllMyBuckets(bucket) {
    return `s3:buckets:${bucket}:ListAllMyBuckets`;
}

/**
* global counter for storageUtilized
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketStorageUtilizedCounter(bucket) {
    return `s3:buckets:${bucket}:storageUtilized:counter`;
}

/**
* global counter for incomingBytes
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketIncomingBytesCounter(bucket) {
    return `s3:buckets:${bucket}:incomingBytes:counter`;
}

/**
* global counter for outgoingBytes
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketOutgoingBytesCounter(bucket) {
    return `s3:buckets:${bucket}:outgoingBytes:counter`;
}

/**
* global counter for NumberOfObjects
* @param {string} bucket - bucket name
* @return {string} - schema key
*/
export function bucketNumberOfObjectsCounter(bucket) {
    return `s3:buckets:${bucket}:numberOfObjects:counter`;
}
