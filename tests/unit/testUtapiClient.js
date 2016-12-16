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
const bucket = 'foo';
const newByteLength = 1024;

// Set mock data of a particular size and count.
function setData(objectSize, objectCount, timestamp) {
    memoryBackend.data = {
        's3:buckets:foo:storageUtilized:counter': objectSize,
        's3:buckets:foo:numberOfObjects:counter': objectCount,
        's3:buckets:foo:storageUtilized': [[timestamp, objectSize]],
        's3:buckets:foo:numberOfObjects': [[timestamp, objectCount]],
    };
    return undefined;
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
    let c;
    let timestamp;
    beforeEach(() => {
        c = new UtapiClient();
        c.setDataStore(ds);
        timestamp = getNormalizedTimestamp(Date.now());
    });

    afterEach(() => memoryBackend.flushDb());

    it('should push metric for createBucket', done => {
        c.pushMetric('createBucket', REQUID, { bucket }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '0',
                's3:buckets:foo:numberOfObjects:counter': '0',
                's3:buckets:foo:storageUtilized': [[timestamp, '0']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '0']],
            };
            expected[`s3:buckets:${timestamp}:foo:CreateBucket`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for deleteBucket', done => {
        c.pushMetric('deleteBucket', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:DeleteBucket`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for listBucket', done => {
        c.pushMetric('listBucket', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:ListBucket`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for getBucketAcl', done => {
        c.pushMetric('getBucketAcl', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:GetBucketAcl`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for putBucketAcl', done => {
        c.pushMetric('putBucketAcl', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:PutBucketAcl`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for putBucketWebsite', done => {
        c.pushMetric('putBucketWebsite', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:PutBucketWebsite`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for getBucketWebsite', done => {
        c.pushMetric('getBucketWebsite', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:GetBucketWebsite`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for deleteBucketWebsite', done => {
        c.pushMetric('deleteBucketWebsite', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:DeleteBucketWebsite`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for uploadPart', done => {
        c.pushMetric('uploadPart', REQUID, { bucket, newByteLength }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': `${newByteLength}`,
                's3:buckets:foo:storageUtilized': [[timestamp,
                    `${newByteLength}`]],
            };
            expected[`s3:buckets:${timestamp}:foo:incomingBytes`] =
                `${newByteLength}`;
            expected[`s3:buckets:${timestamp}:foo:UploadPart`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for initiateMultipartUpload', done => {
        c.pushMetric('initiateMultipartUpload', REQUID, { bucket }, () => {
            const expected = {};
            const k = `s3:buckets:${timestamp}:foo:InitiateMultipartUpload`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for completeMultipartUpload', done => {
        c.pushMetric('completeMultipartUpload', REQUID, { bucket }, () => {
            const expected = {
                's3:buckets:foo:numberOfObjects:counter': '1',
                's3:buckets:foo:numberOfObjects': [[timestamp, '1']],
            };
            const k = `s3:buckets:${timestamp}:foo:CompleteMultipartUpload`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for listMultipartUploads', done => {
        c.pushMetric('listMultipartUploads', REQUID, { bucket }, () => {
            const expected = {};
            const k = `s3:buckets:${timestamp}:foo:ListBucketMultipartUploads`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for listMultipartUploadParts', done => {
        c.pushMetric('listMultipartUploadParts', REQUID, { bucket }, () => {
            const expected = {};
            const k = `s3:buckets:${timestamp}:foo:ListMultipartUploadParts`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for abortMultipartUpload', done => {
        c.pushMetric('abortMultipartUpload', REQUID, { bucket }, () => {
            const expected = {};
            const k = `s3:buckets:${timestamp}:foo:AbortMultipartUpload`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for deleteObject', done => {
        // Set mock data of one, 1024 byte object for `deleteObject` to update.
        setData('1024', '1', timestamp);
        c.pushMetric('deleteObject', REQUID, {
            bucket,
            byteLength: 1024,
            numberOfObjects: 1,
        }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '0',
                's3:buckets:foo:numberOfObjects:counter': '0',
                's3:buckets:foo:storageUtilized': [[timestamp, '0']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '0']],
            };
            const k = `s3:buckets:${timestamp}:foo:DeleteObject`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for multiObjectDelete', done => {
        // Set mock data of two, 1024 byte objects for `multiObjectDelete` to
        // update.
        setData('2048', '2', timestamp);
        c.pushMetric('multiObjectDelete', REQUID, {
            bucket,
            byteLength: 2048, // Total byte length of objects deleted.
            numberOfObjects: 2,
        }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '0',
                's3:buckets:foo:numberOfObjects:counter': '0',
                's3:buckets:foo:storageUtilized': [[timestamp, '0']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '0']],
            };
            const k = `s3:buckets:${timestamp}:foo:MultiObjectDelete`;
            expected[k] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for getObject', done => {
        c.pushMetric('getObject', REQUID, {
            bucket,
            newByteLength: 1024,
        }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:outgoingBytes`] = '1024';
            expected[`s3:buckets:${timestamp}:foo:GetObject`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for getObjectAcl', done => {
        c.pushMetric('getObjectAcl', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:GetObjectAcl`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for putObject', done => {
        c.pushMetric('putObject', REQUID, {
            bucket,
            newByteLength: 1024,
            oldByteLength: null,
        }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '1024',
                's3:buckets:foo:numberOfObjects:counter': '1',
                's3:buckets:foo:storageUtilized': [[timestamp, '1024']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '1']],
            };
            expected[`s3:buckets:${timestamp}:foo:PutObject`] = '1';
            expected[`s3:buckets:${timestamp}:foo:incomingBytes`] = '1024';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for putObject overwrite', done => {
        // Set mock data of one, 1024 byte object for `putObject` to overwrite.
        setData('1024', '1', timestamp);
        c.pushMetric('putObject', REQUID, {
            bucket,
            newByteLength: 2048,
            oldByteLength: 1024,
        }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '2048',
                's3:buckets:foo:numberOfObjects:counter': '1',
                's3:buckets:foo:storageUtilized': [[timestamp, '2048']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '1']],
            };
            expected[`s3:buckets:${timestamp}:foo:PutObject`] = '1';
            expected[`s3:buckets:${timestamp}:foo:incomingBytes`] = '2048';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for copyObject', done => {
        c.pushMetric('copyObject', REQUID, {
            bucket,
            newByteLength: 1024,
            oldByteLength: null,
        }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '1024',
                's3:buckets:foo:numberOfObjects:counter': '1',
                's3:buckets:foo:storageUtilized': [[timestamp, '1024']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '1']],
            };
            expected[`s3:buckets:${timestamp}:foo:CopyObject`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for copyObject overwrite', done => {
        // Set mock data of one, 1024 byte object for `copyObject` to overwrite.
        setData('1024', '1', timestamp);
        c.pushMetric('copyObject', REQUID, {
            bucket,
            newByteLength: 2048,
            oldByteLength: 1024,
        }, () => {
            const expected = {
                's3:buckets:foo:storageUtilized:counter': '2048',
                's3:buckets:foo:numberOfObjects:counter': '1',
                's3:buckets:foo:storageUtilized': [[timestamp, '2048']],
                's3:buckets:foo:numberOfObjects': [[timestamp, '1']],
            };
            expected[`s3:buckets:${timestamp}:foo:CopyObject`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for putObjectAcl', done => {
        c.pushMetric('putObjectAcl', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:PutObjectAcl`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for headBucket', done => {
        c.pushMetric('headBucket', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:HeadBucket`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });

    it('should push metric for headObject', done => {
        c.pushMetric('headObject', REQUID, { bucket }, () => {
            const expected = {};
            expected[`s3:buckets:${timestamp}:foo:HeadObject`] = '1';
            assert.deepStrictEqual(memoryBackend.data, expected);
            done();
        });
    });
});
