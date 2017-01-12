import assert from 'assert';
import { Logger } from 'werelogs';
import Datastore from '../../src/lib/Datastore';
import MemoryBackend from '../../src/lib/backend/Memory';
import UtapiClient from '../../src/lib/UtapiClient';
import { getNormalizedTimestamp } from '../testUtils';

const memoryBackend = new MemoryBackend();
const ds = new Datastore();
ds.setClient(memoryBackend);
const REQUID = 'aaaaaaaaaaaaaaaaaaa';
const metricTypes = {
    bucket: 'foo-bucket',
    accountId: 'foo-account',
};

// Get prefix values to construct the expected Redis schema keys
function getPrefixValues(timestamp) {
    const arr = [];
    Object.keys(metricTypes).forEach(metric => {
        if (metricTypes[metric] === undefined) {
            return;
        }
        const name = metricTypes[metric];
        let type;
        if (metric === 'bucket') {
            type = 'buckets';
        } else if (metric === 'accountId') {
            type = 'accounts';
        }
        arr.push({
            key: `s3:${type}:${name}`,
            timestampKey: `s3:${type}:${timestamp}:${name}`,
        });
    });
    return arr;
}

// Set mock data of a particular storageUtilized and numberOfObjects
function setMockData(storageUtilized, numberOfObjects, timestamp, cb) {
    const prefixValuesArr = getPrefixValues(timestamp);
    prefixValuesArr.forEach(type => {
        const { key } = type;
        memoryBackend.data[`${key}:storageUtilized:counter`] = storageUtilized;
        memoryBackend.data[`${key}:storageUtilized`] = [[timestamp,
            storageUtilized]];
        memoryBackend.data[`${key}:numberOfObjects:counter`] = numberOfObjects;
        memoryBackend.data[`${key}:numberOfObjects`] = [[timestamp,
            numberOfObjects]];
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
    const c = new UtapiClient();
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
        assert.strictEqual(c.ds, null);
    });

    it('should enable client when redis config is provided', () => {
        const c = new UtapiClient({ redis: { host: 'localhost', port: 6379 } });
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

    it('should push createBucket metrics', done => {
        const expected = getObject(timestamp, {
            action: 'CreateBucket',
            storageUtilized: '0',
            numberOfObjects: '0',
        });
        testMetric('createBucket', metricTypes, expected, done);
    });

    it('should push deleteBucket metrics', done => {
        const expected = getObject(timestamp, { action: 'DeleteBucket' });
        testMetric('deleteBucket', metricTypes, expected, done);
    });

    it('should push listBucket metrics', done => {
        const expected = getObject(timestamp, { action: 'ListBucket' });
        testMetric('listBucket', metricTypes, expected, done);
    });

    it('should push getBucketAcl metrics', done => {
        const expected = getObject(timestamp, { action: 'GetBucketAcl' });
        testMetric('getBucketAcl', metricTypes, expected, done);
    });

    it('should push putBucketAcl metrics', done => {
        const expected = getObject(timestamp, { action: 'PutBucketAcl' });
        testMetric('putBucketAcl', metricTypes, expected, done);
    });

    it('should push putBucketWebsite metrics', done => {
        const expected = getObject(timestamp, { action: 'PutBucketWebsite' });
        testMetric('putBucketWebsite', metricTypes, expected, done);
    });

    it('should push getBucketWebsite metrics', done => {
        const expected = getObject(timestamp, { action: 'GetBucketWebsite' });
        testMetric('getBucketWebsite', metricTypes, expected, done);
    });
    it('should push deleteBucketWebsite metrics', done => {
        const expected = getObject(timestamp,
            { action: 'DeleteBucketWebsite' });
        testMetric('deleteBucketWebsite', metricTypes, expected, done);
    });

    it('should push uploadPart metrics', done => {
        const expected = getObject(timestamp, {
            action: 'UploadPart',
            storageUtilized: '1024',
            incomingBytes: '1024',
        });
        Object.assign(params, metricTypes,
            { newByteLength: 1024 });
        testMetric('uploadPart', params, expected, done);
    });

    it('should push initiateMultipartUpload metrics', done => {
        const expected = getObject(timestamp,
            { action: 'InitiateMultipartUpload' });
        testMetric('initiateMultipartUpload', metricTypes, expected, done);
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

    it('should push listMultipartUploadParts metrics', done => {
        const expected = getObject(timestamp,
            { action: 'ListMultipartUploadParts' });
        testMetric('listMultipartUploadParts', metricTypes, expected, done);
    });

    it('should push abortMultipartUpload metrics', done => {
        const expected = getObject(timestamp,
            { action: 'AbortMultipartUpload' });
        testMetric('abortMultipartUpload', metricTypes, expected, done);
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
        setMockData('1024', '1', timestamp, () =>
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
        setMockData('2048', '2', timestamp, () =>
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

    it('should push getObjectAcl metrics', done => {
        const expected = getObject(timestamp,
            { action: 'GetObjectAcl' });
        testMetric('getObjectAcl', metricTypes, expected, done);
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
        setMockData('1024', '1', timestamp, () =>
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
        setMockData('1024', '1', timestamp, () =>
            testMetric('copyObject', params, expected, done));
    });

    it('should push putObjectAcl metrics', done => {
        const expected = getObject(timestamp, { action: 'PutObjectAcl' });
        testMetric('putObjectAcl', metricTypes, expected, done);
    });

    it('should push headBucket metrics', done => {
        const expected = getObject(timestamp, { action: 'HeadBucket' });
        testMetric('headBucket', metricTypes, expected, done);
    });

    it('should push headObject metrics', done => {
        const expected = getObject(timestamp, { action: 'HeadObject' });
        testMetric('headObject', metricTypes, expected, done);
    });
});
