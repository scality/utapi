const assert = require('assert');
const { Logger } = require('werelogs');
const Datastore = require('../../lib/Datastore');
const MemoryBackend = require('../../lib/backend/Memory');
const UtapiClient = require('../../lib/UtapiClient');
const { getNormalizedTimestamp } = require('../utils/utils');
const member = require('../../utils/member');

const memoryBackend = new MemoryBackend();
const ds = new Datastore();
ds.setClient(memoryBackend);
const REQUID = 'aaaaaaaaaaaaaaaaaaa';
const metricTypes = {
    bucket: 'foo-bucket',
    accountId: 'foo-account',
    userId: 'foo-user',
};
const redisLocal = { host: 'localhost', port: 6379 };
const config = {
    redis: redisLocal,
    localCache: redisLocal,
    component: 's3',
};

function isSortedSetKey(key) {
    return key.endsWith('storageUtilized') || key.endsWith('numberOfObjects');
}

function deserializeMemoryBackend(data) {
    Object.keys(data).forEach(key => {
        if (isSortedSetKey(key)) {
            data[key][0][1] = member.deserialize(data[key][0][1]); // eslint-disable-line
        }
    });
}

// Build prefix values to construct the expected Redis schema keys
function getPrefixValues(timestamp) {
    return [
        {
            key: 's3:buckets:foo-bucket',
            timestampKey: `s3:buckets:${timestamp}:foo-bucket`,
        },
        {
            key: 's3:accounts:foo-account',
            timestampKey: `s3:accounts:${timestamp}:foo-account`,
        },
        {
            key: 's3:users:foo-user',
            timestampKey: `s3:users:${timestamp}:foo-user`,
        },
        {
            key: 's3:service:s3',
            timestampKey: `s3:service:${timestamp}:s3`,
        },
    ];
}

// Set mock data of a particular storageUtilized and numberOfObjects
function setMockData(data, timestamp, cb) {
    const prefixValuesArr = getPrefixValues(timestamp);
    const { storageUtilized, numberOfObjects } = data;
    prefixValuesArr.forEach(type => {
        const { key } = type;
        if (storageUtilized) {
            memoryBackend.data[`${key}:storageUtilized:counter`] = storageUtilized;
            memoryBackend.data[`${key}:storageUtilized`] = [[timestamp,
                storageUtilized]];
        }
        if (numberOfObjects) {
            memoryBackend.data[`${key}:numberOfObjects:counter`] = numberOfObjects;
            memoryBackend.data[`${key}:numberOfObjects`] = [[timestamp,
                numberOfObjects]];
        }
    });
    return cb();
}

describe('UtapiClient:: enable/disable client', () => {
    it('should disable client when no redis config is provided', () => {
        const c = new UtapiClient();
        assert.strictEqual(c instanceof UtapiClient, true);
        assert.strictEqual(c.disableClient, true);
        assert.strictEqual(c.log instanceof Logger, true);
        assert.strictEqual(c.ds, undefined);
    });

    it('should enable client when redis config is provided', () => {
        const c = new UtapiClient(config);
        assert.strictEqual(c instanceof UtapiClient, true);
        assert.strictEqual(c.disableClient, false);
        assert.strictEqual(c.log instanceof Logger, true);
        assert.strictEqual(c.ds instanceof Datastore, true);
    });
});

describe('UtapiClient:: _isCounterEnabled', () => {
    const metric = 'putObject';

    it('should return true when disableOperationCounters and '
    + 'enabledOperationCounters are not provided in config', () => {
        const client = new UtapiClient();
        const result = client._isCounterEnabled(metric);
        assert.strictEqual(result, true);
    });

    it('should return false when disableOperationCounters is true', () => {
        const client = new UtapiClient({
            disableOperationCounters: true,
        });
        const result = client._isCounterEnabled(metric);
        assert.strictEqual(result, false);
    });

    describe('when enabledOperationCounters is provided in config', () => {
        it('should return false wmetric is not in the list', () => {
            const client = new UtapiClient({
                enabledOperationCounters: ['createBucket'],
            });
            const result = client._isCounterEnabled(metric);
            assert.strictEqual(result, false);
        });

        it('should return true when metric is in the list', () => {
            const client = new UtapiClient({
                enabledOperationCounters: [metric],
            });
            const result = client._isCounterEnabled(metric);
            assert.strictEqual(result, true);
        });
    });
});

const tests = [
    {
        description: 'with no custom configuration',
        configuration: {},
    },
    {
        description: 'when disableOperationCounters is true',
        configuration: {
            disableOperationCounters: true,
        },
    },
    {
        description: 'when enabledOperationCounters is missing the counter',
        configuration: {
            enabledOperationCounters: [''],
        },
    },
    {
        description: 'when enabledOperationCounters includes the counter',
        configuration: {
            enabledOperationCounters: [
                'DeleteBucket',
                'DeleteBucketCors',
                'DeleteBucketWebsite',
                'DeleteObjectTagging',
                'ListBucket',
                'GetBucketAcl',
                'GetBucketCors',
                'GetBucketWebsite',
                'GetBucketLocation',
                'CreateBucket',
                'PutBucketAcl',
                'PutBucketCors',
                'PutBucketWebsite',
                'PutObject',
                'CopyObject',
                'UploadPart',
                'UploadPartCopy',
                'ListBucketMultipartUploads',
                'ListMultipartUploadParts',
                'InitiateMultipartUpload',
                'CompleteMultipartUpload',
                'AbortMultipartUpload',
                'DeleteObject',
                'MultiObjectDelete',
                'GetObject',
                'GetObjectAcl',
                'GetObjectTagging',
                'PutObjectAcl',
                'PutObjectTagging',
                'HeadBucket',
                'HeadObject',
                'PutBucketVersioning',
                'GetBucketVersioning',
                'PutBucketReplication',
                'GetBucketReplication',
                'DeleteBucketReplication',
                'PutBucketObjectLock',
                'GetBucketObjectLock',
                'PutObjectRetention',
                'GetObjectRetention',
                'PutObjectLegalHold',
                'GetObjectLegalHold',
                'ReplicateObject',
                'ReplicateDelete',
                'ReplicateTags',
            ],
        },
    },
];

tests.forEach(test => {
    const { configuration, description } = test;

    const timestamp = getNormalizedTimestamp(Date.now());

    function shouldIncludeCounter(action) {
        const { enabledOperationCounters } = configuration;
        if (enabledOperationCounters && enabledOperationCounters.length > 0) {
            return enabledOperationCounters.some(
                counter => counter.toLowerCase() === action.toLowerCase(),
            );
        }
        return !configuration.disableOperationCounters;
    }

    // Get the expected object for comparison
    function buildExpectedResult(data) {
        const obj = {};
        const prefixValuesArr = getPrefixValues(timestamp);
        prefixValuesArr.forEach(type => {
            const { key, timestampKey } = type;
            if (data.action && shouldIncludeCounter(data.action)) {
                obj[`${timestampKey}:${data.action}`] = '1';
            }
            // The expected object is constructed based on the `data` object
            Object.keys(data).forEach(metric => {
                if (metric === 'storageUtilized') {
                    obj[`${key}:storageUtilized:counter`] = data[metric];
                    obj[`${key}:storageUtilized`] = [[timestamp, data[metric]]];
                } else if (metric === 'numberOfObjects') {
                    obj[`${key}:numberOfObjects:counter`] = data[metric];
                    obj[`${key}:numberOfObjects`] = [[timestamp, data[metric]]];
                } else if (metric !== 'action') {
                    obj[`${timestampKey}:${metric}`] = data[metric];
                }
            });
        });
        return obj;
    }

    function testMetric(metric, params, expected, cb) {
        const c = new UtapiClient(Object.assign({}, config, configuration));
        c.setDataStore(ds);
        c.pushMetric(metric, REQUID, params, () => {
            deserializeMemoryBackend(memoryBackend.data);
            Object.keys(expected).forEach(key => {
                if (memoryBackend.data[key]) {
                    assert.deepStrictEqual(memoryBackend.data[key], expected[key]);
                }
            });
            return cb();
        });
    }

    describe(`UtapiClient:: push metrics ${description}`, () => {
        let params;

        beforeEach(() => {
            params = {
                byteLength: undefined,
                newByteLength: undefined,
                oldByteLength: undefined,
                numberOfObjects: undefined,
            };
        });

        afterEach(() => memoryBackend.flushDb());

        it('should push createBucket metrics', done => {
            const expected = buildExpectedResult({
                action: 'CreateBucket',
            });
            testMetric('createBucket', metricTypes, expected, done);
        });

        it('should push deleteBucket metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteBucket',
            });
            testMetric('deleteBucket', metricTypes, expected, done);
        });

        it('should push listBucket metrics', done => {
            const expected = buildExpectedResult({
                action: 'ListBucket',
            });
            testMetric('listBucket', metricTypes, expected, done);
        });

        it('should push getBucketAcl metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketAcl',
            });
            testMetric('getBucketAcl', metricTypes, expected, done);
        });

        it('should push putBucketAcl metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutBucketAcl',
            });
            testMetric('putBucketAcl', metricTypes, expected, done);
        });

        it('should push putBucketCors metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutBucketCors',
            });
            testMetric('putBucketCors', metricTypes, expected, done);
        });

        it('should push getBucketCors metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketCors',
            });
            testMetric('getBucketCors', metricTypes, expected, done);
        });

        it('should push deleteBucketCors metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteBucketCors',
            });
            testMetric('deleteBucketCors', metricTypes, expected, done);
        });

        it('should push putBucketWebsite metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutBucketWebsite',
            });
            testMetric('putBucketWebsite', metricTypes, expected, done);
        });

        it('should push getBucketWebsite metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketWebsite',
            });
            testMetric('getBucketWebsite', metricTypes, expected, done);
        });

        it('should push getBucketLocation metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketLocation',
            });
            testMetric('getBucketLocation', metricTypes, expected, done);
        });

        it('should push deleteBucketWebsite metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteBucketWebsite',
            });
            testMetric('deleteBucketWebsite', metricTypes, expected, done);
        });

        it('should push uploadPart metrics', done => {
            const expected = buildExpectedResult({
                action: 'UploadPart',
                storageUtilized: '1024',
                incomingBytes: '1024',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: null,
            });
            testMetric('uploadPart', params, expected, done);
        });

        it('should push metric for uploadPart overwrite', done => {
            const expected = buildExpectedResult({
                action: 'UploadPart',
                storageUtilized: '1024',
                incomingBytes: '1024',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: 2048,
            });
            const data = { storageUtilized: '2048' };
            setMockData(data, timestamp, () => {
                testMetric('uploadPart', params, expected, done);
            });
        });

        it('should push uploadPartCopy metrics', done => {
            const expected = buildExpectedResult({
                action: 'UploadPartCopy',
                storageUtilized: '1024',
                incomingBytes: '1024',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: null,
            });
            testMetric('uploadPartCopy', params, expected, done);
        });

        it('should push metric for uploadPartCopy overwrite', done => {
            const expected = buildExpectedResult({
                action: 'UploadPartCopy',
                storageUtilized: '1024',
                incomingBytes: '1024',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: 2048,
            });
            const data = { storageUtilized: '2048' };
            setMockData(data, timestamp, () => {
                testMetric('uploadPartCopy', params, expected, done);
            });
        });

        it('should push initiateMultipartUpload metrics', done => {
            const expected = buildExpectedResult({
                action: 'InitiateMultipartUpload',
            });
            testMetric('initiateMultipartUpload', metricTypes, expected, done);
        });

        it('should push completeMultipartUpload metrics', done => {
            const expected = buildExpectedResult({
                action: 'CompleteMultipartUpload',
                numberOfObjects: '1',
            });
            Object.assign(params, metricTypes, {
                oldByteLength: null,
            });
            testMetric('completeMultipartUpload', params, expected, done);
        });

        it('should push completeMultipartUpload overwrite metrics', done => {
            // Seed data includes an object and uploaded parts storage.
            const data = {
                storageUtilized: '1024',
                numberOfObjects: '1',
            };
            setMockData(data, timestamp, () => {
                // Seed object to overwrite is 512 bytes.
                Object.assign(params, metricTypes, {
                    oldByteLength: 512,
                });
                const expected = buildExpectedResult({
                    action: 'CompleteMultipartUpload',
                    storageUtilized: '512',
                    numberOfObjects: '1',
                });
                testMetric('completeMultipartUpload', params, expected, done);
            });
        });

        it('should push listMultipartUploads metrics', done => {
            const expected = buildExpectedResult({
                action: 'ListBucketMultipartUploads',
            });
            testMetric('listMultipartUploads', metricTypes, expected, done);
        });

        it('should push listMultipartUploadParts metrics', done => {
            const expected = buildExpectedResult({
                action: 'ListMultipartUploadParts',
            });
            testMetric('listMultipartUploadParts', metricTypes, expected, done);
        });

        it('should push abortMultipartUpload metrics', done => {
            const expected = buildExpectedResult({
                action: 'AbortMultipartUpload',
                storageUtilized: '0',
            });
            Object.assign(params, metricTypes, { byteLength: 1024 });
            // Set mock data of one, 1024 byte part object for
            // `AbortMultipartUpload` to update.
            const data = { storageUtilized: '1024' };
            setMockData(data, timestamp, () => {
                testMetric('abortMultipartUpload', params, expected, done);
            });
        });

        it('should push deleteObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteObject',
                storageUtilized: '0',
                numberOfObjects: '0',
            });
            Object.assign(params, metricTypes, {
                byteLength: 1024,
                numberOfObjects: 1,
            });
            // Set mock data of one, 1024 byte object for `deleteObject` to
            // update.
            const data = {
                storageUtilized: '1024',
                numberOfObjects: '1',
            };

            setMockData(data, timestamp, () => {
                testMetric('deleteObject', params, expected, done);
            });
        });

        it('should push multiObjectDelete metrics', done => {
            const expected = buildExpectedResult({
                action: 'MultiObjectDelete',
                storageUtilized: '0',
                numberOfObjects: '0',
            });
            Object.assign(params, metricTypes, {
                byteLength: 2048,
                numberOfObjects: 2,
            });
            // Set mock data of two, 1024 byte objects for `multiObjectDelete`
            // to update.
            const data = {
                storageUtilized: '2048',
                numberOfObjects: '2',
            };
            setMockData(data, timestamp, () => {
                testMetric('multiObjectDelete', params, expected, done);
            });
        });

        it('should push getObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetObject',
                outgoingBytes: '1024',
            });
            Object.assign(params, metricTypes, { newByteLength: 1024 });
            testMetric('getObject', params, expected, done);
        });

        it('should push getObjectAcl metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetObjectAcl',
            });
            testMetric('getObjectAcl', metricTypes, expected, done);
        });

        it('should push getObjectTagging metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetObjectTagging',
            });
            testMetric('getObjectTagging', metricTypes, expected, done);
        });

        it('should push putObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutObject',
                storageUtilized: '1024',
                numberOfObjects: '1',
                incomingBytes: '1024',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: null,
            });
            testMetric('putObject', params, expected, done);
        });

        it('should push putObject overwrite metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutObject',
                storageUtilized: '2048',
                numberOfObjects: '1',
                incomingBytes: '2048',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 2048,
                oldByteLength: 1024,
            });
            // Set mock data of one, 1024 byte object for `putObject` to
            // overwrite. Counter does not increment because it is an overwrite.
            const data = {
                storageUtilized: '1024',
                numberOfObjects: '1',
            };
            setMockData(data, timestamp, () => {
                testMetric('putObject', params, expected, done);
            });
        });

        it('should push copyObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'CopyObject',
                storageUtilized: '1024',
                numberOfObjects: '1',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: null,
            });
            testMetric('copyObject', params, expected, done);
        });

        it('should push copyObject overwrite metrics', done => {
            const expected = buildExpectedResult({
                action: 'CopyObject',
                storageUtilized: '2048',
                numberOfObjects: '1',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 2048,
                oldByteLength: 1024,
            });
            // Set mock data of one, 1024 byte object for `copyObject` to
            // overwrite. Counter does not increment because it is an overwrite.
            const data = {
                storageUtilized: '1024',
                numberOfObjects: '1',
            };
            setMockData(data, timestamp, () => {
                testMetric('copyObject', params, expected, done);
            });
        });

        it('should push putObjectAcl metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutObjectAcl',
            });
            testMetric('putObjectAcl', metricTypes, expected, done);
        });

        it('should push putObjectTagging metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutObjectTagging',
            });
            testMetric('putObjectTagging', metricTypes, expected, done);
        });

        it('should push deleteObjectTagging metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteObjectTagging',
            });
            testMetric('deleteObjectTagging', metricTypes, expected, done);
        });

        it('should push headBucket metrics', done => {
            const expected = buildExpectedResult({
                action: 'HeadBucket',
            });
            testMetric('headBucket', metricTypes, expected, done);
        });

        it('should push headObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'HeadObject',
            });
            testMetric('headObject', metricTypes, expected, done);
        });

        it('should push putBucketVersioning metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutBucketVersioning',
            });
            testMetric('putBucketVersioning', metricTypes, expected, done);
        });

        it('should push getBucketVersioning metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketVersioning',
            });
            testMetric('getBucketVersioning', metricTypes, expected, done);
        });

        // Putting a delete marker increments deleteObject and numberOfObjects
        it('should push putDeleteMarkerObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteObject',
                numberOfObjects: '1',
            });
            testMetric('putDeleteMarkerObject', metricTypes, expected, done);
        });

        it('should push putDeleteMarkerObject metrics and have correct bytes and number of objects', done => {
            const expected = buildExpectedResult({
                action: 'PutObject',
                numberOfObjects: '1',
            });
            const metrics = {
                bucket: '5741-repro',
                keys: ['foo2'],
                byteLength: undefined,
                newByteLength: 258,
                oldByteLength: null,
                numberOfObjects: 1,
                accountId: '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be',
                userId: undefined,
            };
            testMetric('putObject', Object.assign(metrics, metricTypes), expected, () => {
                const expected = buildExpectedResult({
                    action: 'DeleteObject',
                    numberOfObjects: '1',
                });
                const metrics2 = {
                    bucket: '5741-repro',
                    keys: ['foo2'],
                    byteLength: 258,
                    newByteLength: undefined,
                    oldByteLength: undefined,
                    numberOfObjects: undefined,
                    accountId: '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be',
                    userId: undefined,
                };
                testMetric('putDeleteMarkerObject', Object.assign(metrics2, metricTypes), expected, done);
            });
        });

        it('should push putBucketReplication metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutBucketReplication',
            });
            testMetric('putBucketReplication', metricTypes, expected, done);
        });

        it('should push getBucketReplication metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketReplication',
            });
            testMetric('getBucketReplication', metricTypes, expected, done);
        });

        it('should push deleteBucketReplication metrics', done => {
            const expected = buildExpectedResult({
                action: 'DeleteBucketReplication',
            });
            testMetric('deleteBucketReplication', metricTypes, expected, done);
        });

        it('should push putBucketObjectLock metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutBucketObjectLock',
            });
            testMetric('putBucketObjectLock', metricTypes, expected, done);
        });

        it('should push getBucketObjectLock metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetBucketObjectLock',
            });
            testMetric('getBucketObjectLock', metricTypes, expected, done);
        });

        it('should push putObjectRetention metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutObjectRetention',
            });
            testMetric('putObjectRetention', metricTypes, expected, done);
        });

        it('should push getObjectRetention metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetObjectRetention',
            });
            testMetric('getObjectRetention', metricTypes, expected, done);
        });

        it('should push putObjectLegalHold metrics', done => {
            const expected = buildExpectedResult({
                action: 'PutObjectLegalHold',
            });
            testMetric('putObjectLegalHold', metricTypes, expected, done);
        });

        it('should push getObjectLegalHold metrics', done => {
            const expected = buildExpectedResult({
                action: 'GetObjectLegalHold',
            });
            testMetric('getObjectLegalHold', metricTypes, expected, done);
        });

        it('should push replicateObject metrics', done => {
            const expected = buildExpectedResult({
                action: 'ReplicateObject',
                storageUtilized: '1024',
                numberOfObjects: '1',
                incomingBytes: '1024',
            });
            Object.assign(params, metricTypes, {
                newByteLength: 1024,
                oldByteLength: null,
            });
            testMetric('replicateObject', params, expected, done);
        });

        it('should push replicateDelete metrics', done => {
            const expected = buildExpectedResult({
                action: 'ReplicateDelete',
                numberOfObjects: '1',
            });
            testMetric('replicateDelete', metricTypes, expected, done);
        });

        it('should push replicateTags metrics', done => {
            const expected = buildExpectedResult({
                action: 'ReplicateTags',
            });
            testMetric('replicateTags', metricTypes, expected, done);
        });

        // Allows for decoupling of projects that use Utapi
        it('should allow pushing an unsupported metric', done => {
            const expected = {};
            testMetric('unsupportedMetric', metricTypes, expected, done);
        });
    });
});

