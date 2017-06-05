const assert = require('assert');
const { Logger } = require('werelogs');
const Datastore = require('../../lib/Datastore');
const MemoryBackend = require('../../lib/backend/Memory');
const UtapiClient = require('../../lib/UtapiClient');
const { getNormalizedTimestamp } = require('../testUtils');
const { genericOperations, getS3Operation } =
    require('../../utils/S3operations');

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
            memoryBackend.data[`${key}:storageUtilized:counter`] =
                storageUtilized;
            memoryBackend.data[`${key}:storageUtilized`] = [[timestamp,
                storageUtilized]];
        }
        if (numberOfObjects) {
            memoryBackend.data[`${key}:numberOfObjects:counter`] =
                numberOfObjects;
            memoryBackend.data[`${key}:numberOfObjects`] = [[timestamp,
                numberOfObjects]];
        }
    });
    return cb();
}

// Get the expected object for comparison
function getObject(timestamp, data) {
    const obj = {};
    const prefixValuesArr = getPrefixValues(timestamp);
    prefixValuesArr.forEach(type => {
        const { key, timestampKey } = type;
        // The action is always incremented to one in the tests
        obj[`${timestampKey}:${data.action}`] = '1';
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
    const c = new UtapiClient(config);
    c.setDataStore(ds);
    c.pushMetric(metric, REQUID, params, () => {
        assert.deepStrictEqual(memoryBackend.data, expected);
        return cb();
    });
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

describe('UtapiClient:: push metrics', () => {
    const timestamp = getNormalizedTimestamp(Date.now());
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

    genericOperations.forEach(metric => {
        const expected = getObject(timestamp, {
            action: getS3Operation(metric),
        });

        it(`should push ${metric} metrics`, done =>
            testMetric(metric, metricTypes, expected, done));
    });

    it('should push uploadPart metrics', done => {
        const expected = getObject(timestamp, {
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
        const expected = getObject(timestamp, {
            action: 'UploadPart',
            storageUtilized: '1024',
            incomingBytes: '1024',
        });
        Object.assign(params, metricTypes, {
            newByteLength: 1024,
            oldByteLength: 2048,
        });
        const data = { storageUtilized: '2048' };
        setMockData(data, timestamp, () =>
            testMetric('uploadPart', params, expected, done));
    });

    it('should push completeMultipartUpload metrics', done => {
        const expected = getObject(timestamp, {
            action: 'CompleteMultipartUpload',
            numberOfObjects: '1',
        });
        testMetric('completeMultipartUpload', metricTypes, expected, done);
    });

    it('should push listMultipartUploads metrics', done => {
        const expected = getObject(timestamp,
            { action: 'ListBucketMultipartUploads' });
        testMetric('listMultipartUploads', metricTypes, expected, done);
    });

    it('should push abortMultipartUpload metrics', done => {
        const expected = getObject(timestamp, {
            action: 'AbortMultipartUpload',
            storageUtilized: '0',
        });
        Object.assign(params, metricTypes, { byteLength: 1024 });
        // Set mock data of one, 1024 byte part object for
        // `AbortMultipartUpload` to update.
        const data = { storageUtilized: '1024' };
        setMockData(data, timestamp, () =>
            testMetric('abortMultipartUpload', params, expected, done));
    });

    it('should push deleteObject metrics', done => {
        const expected = getObject(timestamp, {
            action: 'DeleteObject',
            storageUtilized: '0',
            numberOfObjects: '0',
        });
        Object.assign(params, metricTypes, {
            byteLength: 1024,
            numberOfObjects: 1,
        });
        // Set mock data of one, 1024 byte object for `deleteObject` to update.
        const data = {
            storageUtilized: '1024',
            numberOfObjects: '1',
        };
        setMockData(data, timestamp, () =>
            testMetric('deleteObject', params, expected, done));
    });

    it('should push multiObjectDelete metrics', done => {
        const expected = getObject(timestamp, {
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
        setMockData(data, timestamp, () =>
            testMetric('multiObjectDelete', params, expected, done));
    });

    it('should push getObject metrics', done => {
        const expected = getObject(timestamp, {
            action: 'GetObject',
            outgoingBytes: '1024',
        });
        Object.assign(params, metricTypes, { newByteLength: 1024 });
        testMetric('getObject', params, expected, done);
    });

    it('should push putObject metrics', done => {
        const expected = getObject(timestamp, {
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
        const expected = getObject(timestamp, {
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
        setMockData(data, timestamp, () =>
            testMetric('putObject', params, expected, done));
    });

    it('should push copyObject metrics', done => {
        const expected = getObject(timestamp, {
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
        const expected = getObject(timestamp, {
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
        setMockData(data, timestamp, () =>
            testMetric('copyObject', params, expected, done));
    });

    // Putting a delete marker increments deleteObject and numberOfObjects
    it('should push putDeleteMarkerObject metrics', done => {
        const expected = getObject(timestamp, {
            action: 'DeleteObject',
            numberOfObjects: '1',
        });
        testMetric('putDeleteMarkerObject', metricTypes, expected, done);
    });

    // Allows for decoupling of projects that use Utapi
    it('should allow pushing an unsupported metric', done => {
        const expected = {};
        testMetric('unsupportedMetric', metricTypes, expected, done);
    });
});
