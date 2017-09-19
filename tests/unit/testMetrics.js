import assert from 'assert';
import { errors } from 'arsenal';
import MemoryBackend from '../../src/lib/backend/Memory';
import Datastore from '../../src/lib/Datastore';
import ListMetrics from '../../src/lib/ListMetrics';
import { generateStateKey, generateKey } from '../../src/lib/schema';
import { Logger } from 'werelogs';
import s3metricResponseJSON from '../../models/s3metricResponse';
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

function assertMetrics(schemaKey, metricName, props, isNegativeValue, done) {
    const timestamp = new Date().setMinutes(0, 0, 0);
    const timeRange = [timestamp, timestamp];
    const expectedRes = getMetricResponse(schemaKey);
    const expectedResProps = props || {};
    const metricType = new ListMetrics(metricLevels[schemaKey], 's3');
    metricType.getMetrics(metricName, timeRange, datastore, logger,
        (err, res) => {
            if (isNegativeValue) {
                assert.deepStrictEqual(err,
                    errors.InternalError.customizeDescription(
                    'Redis server is not ready'));
                return done();
            }
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

function testOps(schemaKey, keyIndex, metricindex, isNegativeValue, done) {
    const schemaObject = getSchemaObject(schemaKey);
    const timestamp = new Date().setMinutes(0, 0, 0);
    let key;
    let props = {};
    let val;
    if (keyIndex === 'storageUtilized' || keyIndex === 'numberOfObjects') {
        key = generateStateKey(schemaObject, keyIndex);
        val = isNegativeValue ? -1024 : 1024;
        props[metricindex] = [val, val];
        memBackend.zadd(key, timestamp, val, () =>
            assertMetrics(schemaKey, schemaObject[schemaKey], props,
                isNegativeValue, done));
    } else if (keyIndex === 'incomingBytes' || keyIndex === 'outgoingBytes') {
        key = generateKey(schemaObject, keyIndex, timestamp);
        val = 1024;
        props[metricindex] = val;
        memBackend.incrby(key, val, () =>
            assertMetrics(schemaKey, schemaObject[schemaKey], props,
                isNegativeValue, done));
    } else {
        key = generateKey(schemaObject, keyIndex, timestamp);
        val = 1;
        props = { operations: {} };
        props.operations[metricindex] = val;
        memBackend.incr(key, () =>
            assertMetrics(schemaKey, schemaObject[schemaKey], props,
                isNegativeValue, done));
    }
}

Object.keys(metricLevels).forEach(schemaKey => {
    const metric = metricLevels[schemaKey];
    describe(`Get ${metric} level metrics`, () => {
        afterEach(() => memBackend.flushDb());

        it(`should list default (0s) ${metric} level metrics of a bucket`,
            done => assertMetrics(schemaKey, resourceNames[schemaKey], null,
                false, done));

        it(`should return ${metric} level metrics for storage utilized`,
            done => testOps(schemaKey, 'storageUtilized', 'storageUtilized',
                false, done));

        it(`should return ${metric} level metrics for number of objects`,
            done => testOps(schemaKey, 'numberOfObjects', 'numberOfObjects',
                false, done));

        it(`should return ${metric} level metrics for incoming bytes`, done =>
            testOps(schemaKey, 'incomingBytes', 'incomingBytes', false, done));

        it(`should return ${metric} level metrics for outgoing bytes`, done =>
            testOps(schemaKey, 'outgoingBytes', 'outgoingBytes', false, done));

        it(`should return ${metric} level metrics for delete bucket`, done =>
            testOps(schemaKey, 'deleteBucket', 's3:DeleteBucket', false, done));

        it(`should return ${metric} level metrics for list bucket`, done =>
            testOps(schemaKey, 'listBucket', 's3:ListBucket', false, done));

        it(`should return ${metric} level metrics for get bucket acl`, done =>
            testOps(schemaKey, 'getBucketAcl', 's3:GetBucketAcl', false, done));

        it(`should return ${metric} level metrics for put bucket acl`, done =>
            testOps(schemaKey, 'putBucketAcl', 's3:PutBucketAcl', false, done));

        it(`should return ${metric} level metrics for get bucket cors`, done =>
            testOps(schemaKey, 'getBucketCors', 's3:GetBucketCors', false,
                done));

        it(`should return ${metric} level metrics for put bucket cors`, done =>
            testOps(schemaKey, 'putBucketCors', 's3:PutBucketCors', false,
                done));

        it(`should return ${metric} level metrics for delete bucket cors`,
            done => testOps(schemaKey, 'deleteBucketCors',
                's3:DeleteBucketCors', false, done));

        it(`should return ${metric} level metrics for get bucket website`,
            done => testOps(schemaKey, 'getBucketWebsite',
                's3:GetBucketWebsite', false, done));

        it(`should return ${metric} level metrics for put bucket website`,
            done => testOps(schemaKey, 'putBucketWebsite',
                's3:PutBucketWebsite', false, done));

        it(`should return ${metric} level metrics for delete bucket website`,
            done => testOps(schemaKey, 'deleteBucketWebsite',
                's3:DeleteBucketWebsite', false, done));

        it(`should return ${metric} level metrics for put object`, done =>
            testOps(schemaKey, 'putObject', 's3:PutObject', false, done));

        it(`should return ${metric} level metrics for copy object`, done =>
            testOps(schemaKey, 'copyObject', 's3:CopyObject', false, done));

        it(`should return ${metric} level metrics for upload part`, done =>
            testOps(schemaKey, 'uploadPart', 's3:UploadPart', false, done));

        it(`should return ${metric} level metrics for list bucket multipart ` +
            'uploads', done => testOps(schemaKey, 'listBucketMultipartUploads',
                's3:ListBucketMultipartUploads', false, done));

        it(`should return ${metric} level metrics for list multipart upload ` +
            'parts', done => testOps(schemaKey, 'listMultipartUploadParts',
                's3:ListMultipartUploadParts', false, done));

        it(`should return ${metric} level metrics for initiate multipart ` +
            'upload', done => testOps(schemaKey, 'initiateMultipartUpload',
                's3:InitiateMultipartUpload', false, done));

        it(`should return ${metric} level metrics for complete multipart ` +
            'upload', done => testOps(schemaKey, 'completeMultipartUpload',
                's3:CompleteMultipartUpload', false, done));

        it(`should return ${metric} level metrics for abort multipart ` +
            'upload', done => testOps(schemaKey, 'abortMultipartUpload',
                's3:AbortMultipartUpload', false, done));

        it(`should return ${metric} level metrics for delete object`, done =>
            testOps(schemaKey, 'deleteObject', 's3:DeleteObject', false, done));

        it(`should return ${metric} level metrics for multiObjectDelete`,
            done => testOps(schemaKey, 'multiObjectDelete',
                's3:MultiObjectDelete', false, done));

        it(`should return ${metric} level metrics for get object`, done =>
            testOps(schemaKey, 'getObject', 's3:GetObject', false, done));

        it(`should return ${metric} level metrics for get object acl`, done =>
            testOps(schemaKey, 'getObjectAcl', 's3:GetObjectAcl', false, done));

        it(`should return ${metric} level metrics for put object acl`, done =>
            testOps(schemaKey, 'putObjectAcl', 's3:PutObjectAcl', false, done));

        it(`should return ${metric} level metrics for head bucket`, done =>
            testOps(schemaKey, 'headBucket', 's3:HeadBucket', false, done));

        it(`should return ${metric} level metrics for head object`, done =>
            testOps(schemaKey, 'headObject', 's3:HeadObject', false, done));
    });
});

Object.keys(metricLevels).forEach(schemaKey => {
    const metric = metricLevels[schemaKey];
    describe(`Get ${metric} level metrics with negative values`, () => {
        afterEach(() => memBackend.flushDb());

        it(`should return ${metric} level metrics for storage utilized as 0`,
            done => testOps(schemaKey, 'storageUtilized', 'storageUtilized',
                true, done));

        it(`should return ${metric} level metrics for number of objects as 0`,
            done => testOps(schemaKey, 'numberOfObjects', 'numberOfObjects',
                true, done));
    });
});
