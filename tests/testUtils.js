import { getKeys, getCounters } from '../src/lib/schema';

const resouceTypes = ['buckets', 'accounts', 'service'];
const propertyNames = {
    buckets: 'bucket',
    accounts: 'accountId',
};
const resources = {
    buckets: 'foo-bucket',
    accounts: 'foo-account',
};

export function getNormalizedTimestamp() {
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
export function getAllResourceTypeKeys() {
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

export function buildMockResponse({ start, end, val }) {
    return {
        timeRange: [start, end],
        storageUtilized: [val, val],
        incomingBytes: val,
        outgoingBytes: val,
        numberOfObjects: [val, val],
        operations: {
            's3:DeleteBucket': val,
            's3:DeleteBucketCors': val,
            's3:DeleteBucketWebsite': val,
            's3:DeleteObjectTagging': val,
            's3:ListBucket': val,
            's3:GetBucketAcl': val,
            's3:GetBucketCors': val,
            's3:GetBucketWebsite': val,
            's3:GetBucketLocation': val,
            's3:CreateBucket': val,
            's3:PutBucketAcl': val,
            's3:PutBucketCors': val,
            's3:PutBucketWebsite': val,
            's3:PutObject': val,
            's3:CopyObject': val,
            's3:UploadPart': val,
            's3:ListBucketMultipartUploads': val,
            's3:ListMultipartUploadParts': val,
            's3:InitiateMultipartUpload': val,
            's3:CompleteMultipartUpload': val,
            's3:AbortMultipartUpload': val,
            's3:DeleteObject': val,
            's3:MultiObjectDelete': val,
            's3:GetObject': val,
            's3:GetObjectAcl': val,
            's3:GetObjectTagging': val,
            's3:PutObjectAcl': val,
            's3:PutObjectTagging': val,
            's3:HeadBucket': val,
            's3:HeadObject': val,
            's3:PutBucketVersioning': val,
            's3:GetBucketVersioning': val,
            's3:PutBucketReplication': val,
            's3:GetBucketReplication': val,
            's3:DeleteBucketReplication': val,
        },
        bucketName: 'utapi-bucket',
    };
}
