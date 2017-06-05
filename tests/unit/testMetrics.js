const assert = require('assert');
const MemoryBackend = require('../../lib/backend/Memory');
const Datastore = require('../../lib/Datastore');
const ListMetrics = require('../../lib/ListMetrics');
const { generateStateKey, generateKey } = require('../../lib/schema');
const { Logger } = require('werelogs');
const s3metricResponseJSON = require('../../models/s3metricResponse');
const { genericOperations, getS3Operation } =
    require('../../utils/S3operations');
const logger = new Logger('UtapiTest');
const memBackend = new MemoryBackend();
const datastore = new Datastore();
const resourceNames = {
    bucket: 'foo-bucket',
    accountId: 'foo-account',
    userId: 'foo-user',
    service: 's3',
};
const metricLevels = {
    bucket: 'buckets',
    accountId: 'accounts',
    userId: 'users',
    service: 'service',
};
datastore.setClient(memBackend);

// Create the metric response object for a given metric.
function getMetricResponse(schemaKey) {
    // Use `JSON.parse` to make deep clone because `Object.assign` will
    // copy property values.
    const response = JSON.parse(JSON.stringify(s3metricResponseJSON));
    const responseKeys = {
        bucket: 'bucketName',
        accountId: 'accountId',
        userId: 'userId',
        service: 'serviceName',
    };
    response[responseKeys[schemaKey]] = resourceNames[schemaKey];
    return response;
}

function assertMetrics(schemaKey, metricName, props, done) {
    const timestamp = new Date().setMinutes(0, 0, 0);
    const timeRange = [timestamp, timestamp];
    const expectedRes = getMetricResponse(schemaKey);
    const expectedResProps = props || {};
    const metricType = new ListMetrics(metricLevels[schemaKey], 's3');
    metricType.getMetrics(metricName, timeRange, datastore, logger,
        (err, res) => {
            assert.strictEqual(err, null);
            // overwrite operations metrics
            if (expectedResProps.operations) {
                Object.assign(expectedRes.operations,
                    expectedResProps.operations);
                delete expectedResProps.operations;
            }
            assert.deepStrictEqual(res, Object.assign(expectedRes,
                { timeRange }, expectedResProps));
            done();
        });
}

// Create the metric object for retrieving Redis keys from schema methods.
function getSchemaObject(schemaKey) {
    const schemaObject = {};
    schemaObject[schemaKey] = resourceNames[schemaKey];
    schemaObject.level = metricLevels[schemaKey];
    // Add the service level to generate key for metric
    schemaObject.service = 's3';
    return schemaObject;
}

function testOps(schemaKey, keyIndex, metricindex, done) {
    const schemaObject = getSchemaObject(schemaKey);
    const timestamp = new Date().setMinutes(0, 0, 0);
    let key;
    let props = {};
    let val;
    if (keyIndex === 'storageUtilized' || keyIndex === 'numberOfObjects') {
        key = generateStateKey(schemaObject, keyIndex);
        val = 1024;
        props[metricindex] = [val, val];
        memBackend.zadd(key, timestamp, val, () =>
            assertMetrics(schemaKey, schemaObject[schemaKey], props, done));
    } else if (keyIndex === 'incomingBytes' || keyIndex === 'outgoingBytes') {
        key = generateKey(schemaObject, keyIndex, timestamp);
        val = 1024;
        props[metricindex] = val;
        memBackend.incrby(key, val, () =>
            assertMetrics(schemaKey, schemaObject[schemaKey], props, done));
    } else {
        key = generateKey(schemaObject, keyIndex, timestamp);
        val = 1;
        props = { operations: {} };
        props.operations[metricindex] = val;
        memBackend.incr(key, () =>
            assertMetrics(schemaKey, schemaObject[schemaKey], props, done));
    }
}

Object.keys(metricLevels).forEach(schemaKey => {
    const metric = metricLevels[schemaKey];
    describe(`Get ${metric} level metrics`, () => {
        afterEach(() => memBackend.flushDb());

        it(`should list default (0s) ${metric} level metrics of a bucket`,
            done => assertMetrics(schemaKey, resourceNames[schemaKey], null,
                done));

        it(`should return ${metric} level metrics for storage utilized`, done =>
            testOps(schemaKey, 'storageUtilized', 'storageUtilized', done));

        it(`should return ${metric} level metrics for number of objects`,
            done => testOps(schemaKey, 'numberOfObjects', 'numberOfObjects',
                done));

        it(`should return ${metric} level metrics for incoming bytes`, done =>
            testOps(schemaKey, 'incomingBytes', 'incomingBytes', done));

        it(`should return ${metric} level metrics for outgoing bytes`, done =>
            testOps(schemaKey, 'outgoingBytes', 'outgoingBytes', done));

        it(`should return ${metric} level metrics for put object`, done =>
            testOps(schemaKey, 'putObject', 's3:PutObject', done));

        it(`should return ${metric} level metrics for copy object`, done =>
            testOps(schemaKey, 'copyObject', 's3:CopyObject', done));

        it(`should return ${metric} level metrics for upload part`, done =>
            testOps(schemaKey, 'uploadPart', 's3:UploadPart', done));

        it(`should return ${metric} level metrics for list bucket multipart ` +
            'uploads', done => testOps(schemaKey, 'listBucketMultipartUploads',
                's3:ListBucketMultipartUploads', done));

        it(`should return ${metric} level metrics for complete multipart ` +
            'upload', done => testOps(schemaKey, 'completeMultipartUpload',
                's3:CompleteMultipartUpload', done));

        it(`should return ${metric} level metrics for abort multipart ` +
            'upload', done => testOps(schemaKey, 'abortMultipartUpload',
                's3:AbortMultipartUpload', done));

        it(`should return ${metric} level metrics for delete object`, done =>
            testOps(schemaKey, 'deleteObject', 's3:DeleteObject', done));

        it(`should return ${metric} level metrics for multiObjectDelete`,
            done => testOps(schemaKey, 'multiObjectDelete',
                's3:MultiObjectDelete', done));

        it(`should return ${metric} level metrics for get object`, done =>
            testOps(schemaKey, 'getObject', 's3:GetObject', done));

        genericOperations.forEach(operation => {
            it(`should return ${metric} level metrics for ${operation}`,
                done => testOps(schemaKey, operation,
                    `s3:${getS3Operation(operation)}`, done));
        });
    });
});
