
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
        'deleteBucketEncryption',
        'deleteBucketReplication',
        'deleteBucketWebsite',
        'deleteObject',
        'deleteObjectTagging',
        'getBucketAcl',
        'getBucketCors',
        'getBucketEncryption',
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
        'putBucketEncryption',
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
        operations: 'ops',
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

    warp10EventType: ':m:utapi/event:',
    warp10RecordType: ':m:utapi/record:',
    truthy,
    checkpointLagSecs: 300,
    snapshotLagSecs: 900,
    repairLagSecs: 5,
    counterBaseValueExpiration: 86400, // 24hrs
    keyVersionSplitter: String.fromCharCode(0),
    migrationChunksize: 500,
    migrationOpTranslationMap: {
        listBucketMultipartUploads: 'listMultipartUploads',
    },
    ingestionOpTranslationMap: {
        putDeleteMarkerObject: 'deleteObject',
    },
    expirationChunkDuration: 900000000, // 15 minutes in microseconds
};

constants.operationToResponse = constants.operations
    .reduce((prev, opId) => {
        prev[opId] = `s3:${opId.charAt(0).toUpperCase() + opId.slice(1)}`;
        return prev;
    }, {});

module.exports = constants;
