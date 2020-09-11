
const truthy = new Set([
    'true',
    'on',
    'yes',
    'y',
    't',
    'enabled',
    'enable',
    '1',
]);

const constants = {
    envNamespace: 'UTAPI',
    operations: [
        'abortMultipartUpload',
        'completeMultipartUpload',
        'copyObject',
        'createBucket',
        'deleteBucket',
        'deleteBucketCors',
        'deleteBucketReplication',
        'deleteBucketWebsite',
        'deleteObject',
        'deleteObjectTagging',
        'getBucketAcl',
        'getBucketCors',
        'getBucketLocation',
        'getBucketNotification',
        'getBucketObjectLock',
        'getBucketReplication',
        'getBucketVersioning',
        'getBucketWebsite',
        'getObject',
        'getObjectAcl',
        'getObjectLegalHold',
        'getObjectRetention',
        'getObjectTagging',
        'headBucket',
        'headObject',
        'initiateMultipartUpload',
        'listBucket',
        'listMultipartUploadParts',
        'listMultipartUploads',
        'multiObjectDelete',
        'putBucketAcl',
        'putBucketCors',
        'putBucketNotification',
        'putBucketObjectLock',
        'putBucketReplication',
        'putBucketVersioning',
        'putBucketWebsite',
        'putData',
        'putDeleteMarkerObject',
        'putObject',
        'putObjectAcl',
        'putObjectLegalHold',
        'putObjectRetention',
        'putObjectTagging',
        'uploadPart',
        'uploadPartCopy',
    ],
    eventFieldsToWarp10: {
        operationId: 'op',
        uuid: 'id',
        bucket: 'bck',
        object: 'obj',
        versionId: 'vid',
        account: 'acc',
        user: 'usr',
        location: 'loc',
        objectDelta: 'objD',
        sizeDelta: 'sizeD',
        incomingBytes: 'inB',
        outgoingBytes: 'outB',
    },
    indexedEventFields: [
        'acc',
        'usr',
        'bck',
    ],
    serviceToWarp10Label: {
        locations: 'loc',
        accounts: 'acc',
        users: 'usr',
        buckets: 'bck',
    },

    warp10ValueType: ':m:utapi/event:',
    truthy,
    shardIngestLagSecs: 30,
    checkpointLagSecs: 300,
    snapshotLagSecs: 900,
    repairLagSecs: 5,
    counterBaseValueExpiration: 86400, // 24hrs
};

constants.operationToResponse = constants.operations
    .reduce((prev, opId) => {
        prev[opId] = `s3:${opId.charAt(0).toUpperCase() + opId.slice(1)}`;
        return prev;
    }, {});

module.exports = constants;
