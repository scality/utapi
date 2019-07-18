const http = require('http');
const aws4 = require('aws4');

const { getKeys, getCounters } = require('../../lib/schema');
const UtapiClient = require('../../lib/UtapiClient');

const resouceTypes = ['buckets', 'accounts', 'service'];
const propertyNames = {
    buckets: 'bucket',
    accounts: 'accountId',
};
const resources = {
    buckets: 'foo-bucket',
    accounts: 'foo-account',
};

// Build the resouceType object that gets keys from the schema.
function _getResourceTypeObject(resourceType) {
    const obj = { level: resourceType, service: 's3' };
    if (resourceType !== 'service') {
        obj[propertyNames[resourceType]] = resources[resourceType];
    }
    return obj;
}

// Get all keys for each resource type from the schema.
function getAllResourceTypeKeys() {
    const timestamp = UtapiClient.getNormalizedTimestamp();
    const allResourceTypeKeys = resouceTypes.map(resourceType => {
        const obj = _getResourceTypeObject(resourceType);
        const counters = getCounters(obj);
        const keys = getKeys(obj, timestamp);
        return counters.concat(keys);
    });
    // Concatenate each array of resourceType keys into one single array.
    return [].concat.apply([], allResourceTypeKeys);
}

function buildMockResponse({ start, end, val }) {
    return {
        timeRange: [start.time, end.time],
        storageUtilized: [start.storageUtilized, end.storageUtilized],
        incomingBytes: val,
        outgoingBytes: val,
        numberOfObjects: [start.numberOfObjects, end.numberOfObjects],
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
            's3:UploadPartCopy': val,
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

function makeUtapiClientRequest({ timeRange, resource }, cb) {
    const header = {
        host: 'localhost',
        port: 8100,
        method: 'POST',
        service: 's3',
        path: `/${resource.type}?Action=ListMetrics`,
    };
    const credentials = {
        accessKeyId: 'accessKey1',
        secretAccessKey: 'verySecretKey1',
    };
    const options = aws4.sign(header, credentials);
    const req = http.request(options, res => {
        const body = [];
        res.on('data', chunk => body.push(chunk));
        res.on('end', () => cb(null, `${body.join('')}`));
    });
    req.on('error', err => cb(err));
    const body = { timeRange };
    body[resource.type] = resource[resource.type];
    req.write(JSON.stringify(body));
    req.end();
}

function _getStartTime() {
    const thirtySeconds = (1000) * 30;
    return UtapiClient.getNormalizedTimestamp() - thirtySeconds;
}

function _getEndTime() {
    const fifteenSeconds = (1000) * 15;
    return (UtapiClient.getNormalizedTimestamp() - 1) + fifteenSeconds;
}

function _buildRequestBody(resource) {
    const { type } = resource;
    const body = { timeRange: [_getStartTime(), _getEndTime()] };
    body[type] = resource[type];
    return JSON.stringify(body);
}

function listMetrics(resource, cb) {
    const requestBody = _buildRequestBody(resource);
    const header = {
        host: 'localhost',
        port: 8100,
        method: 'POST',
        service: 's3',
        path: `/${resource.type}?Action=ListMetrics`,
        signQuery: false,
        body: requestBody,
    };
    const options = aws4.sign(header, {
        accessKeyId: 'accessKey1',
        secretAccessKey: 'verySecretKey1',
    });
    const request = http.request(options, response => {
        const body = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
            const data = JSON.parse(body.join(''));
            cb(null, data);
        });
    });
    request.on('error', err => cb(err));
    request.write(requestBody);
    request.end();
}

module.exports = {
    listMetrics,
    getAllResourceTypeKeys,
    buildMockResponse,
    makeUtapiClientRequest,
};
