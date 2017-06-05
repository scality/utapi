// Operations that use the `_genericPushMetric` method of UtapiClient.
const genericOperations = [
    'createBucket',
    'deleteBucket',
    'listBucket',
    'getBucketAcl',
    'putBucketAcl',
    'putBucketCors',
    'getBucketCors',
    'deleteBucketCors',
    'putBucketWebsite',
    'getBucketWebsite',
    'getBucketLocation',
    'deleteBucketWebsite',
    'initiateMultipartUpload',
    'listMultipartUploadParts',
    'getObjectAcl',
    'getObjectTagging',
    'putObjectAcl',
    'putObjectTagging',
    'deleteObjectTagging',
    'headBucket',
    'headObject',
    'putBucketVersioning',
    'getBucketVersioning',
    'putBucketReplication',
];

/**
* Build the methods object for UtapiClient
* @return {object} - An object that maps each operation to its method in
* UtapiClient
*/
function getMethodsObject() {
    const methods = {
        uploadPart: '_pushMetricUploadPart',
        completeMultipartUpload: '_pushMetricCompleteMultipartUpload',
        listMultipartUploads: '_pushMetricListBucketMultipartUploads',
        abortMultipartUpload: '_genericPushMetricDeleteObject',
        deleteObject: '_genericPushMetricDeleteObject',
        multiObjectDelete: '_genericPushMetricDeleteObject',
        getObject: '_pushMetricGetObject',
        putObject: '_genericPushMetricPutObject',
        copyObject: '_genericPushMetricPutObject',
        putDeleteMarkerObject: '_pushMetricDeleteMarkerObject',
    };
    genericOperations.forEach(method => {
        methods[method] = '_genericPushMetric';
    });
    return methods;
}

/**
* Get the S3 response representation of the operation
* @param {string} operation - The S3 operation name
* @return {string} - The operation with its first letter capitalized
*/
function getS3Operation(operation) {
    return `${operation[0].toUpperCase()}` +
        `${operation.slice(1, operation.length)}`;
}

module.exports = {
    methods: getMethodsObject(),
    genericOperations,
    getS3Operation,
};
