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
// const oldByteLength = 256;

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
});
