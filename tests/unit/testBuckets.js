import assert from 'assert';
import Buckets from '../../lib/Buckets';
import MemoryBackend from '../../lib/backend/Memory';
import Datastore from '../../lib/Datastore';
import { genBucketStateKey, genBucketKey } from '../../lib/schema';
import { Logger } from 'werelogs';
const logger = new Logger('UtapiTest');
const testBucket = 'foo';
const memBackend = new MemoryBackend();
const datastore = new Datastore();
datastore.setClient(memBackend);

const expectedRes = {
    bucketName: 'foo',
    timeRange: [],
    storageUtilized: [0, 0],
    incomingBytes: 0,
    outgoingBytes: 0,
    numberOfObjects: [0, 0],
    operations: {
        's3:DeleteBucket': 0,
        's3:ListBucket': 0,
        's3:GetBucketAcl': 0,
        's3:CreateBucket': 0,
        's3:PutBucketAcl': 0,
        's3:PutObject': 0,
        's3:UploadPart': 0,
        's3:ListBucketMultipartUploads': 0,
        's3:ListMultipartUploadParts': 0,
        's3:InitiateMultipartUpload': 0,
        's3:CompleteMultipartUpload': 0,
        's3:AbortMultipartUpload': 0,
        's3:DeleteObject': 0,
        's3:GetObject': 0,
        's3:GetObjectAcl': 0,
        's3:PutObjectAcl': 0,
        's3:ListAllMyBuckets': 0,
        's3:HeadBucket': 0,
        's3:HeadObject': 0,
    },
};

function assertMetrics(bucket, timeRange, props, done) {
    const expectedResProps = props || {};
    Buckets.getBucketMetrics(bucket, timeRange, datastore, logger,
        (err, res) => {
            assert.strictEqual(err, null);
            // overwrite operations metrics
            if (expectedResProps.operations) {
                Object.assign(expectedRes.operations,
                    expectedResProps.operations);
                delete expectedResProps.operations;
            }
            assert.deepStrictEqual(res, Object.assign({}, expectedRes,
                { timeRange }, expectedResProps));
            done();
        });
}

describe('Get Bucket Metrics', () => {
    afterEach(() => memBackend.flushDb());

    it('should list default (0s) metrics of a bucket', done => {
        const t = new Date();
        t.setMinutes(0, 0, 0);
        const timeStart = t.getTime();
        assertMetrics(testBucket, [timeStart, timeStart], null, done);
    });

    it('should return metrics for storage utilized', done => {
        const key = genBucketStateKey(testBucket, 'storageUtilized');
        const storageVal = 1024;
        const t = new Date();
        t.setMinutes(0, 0, 0);
        const timeStart = t.getTime();
        memBackend.zadd(key, timeStart, storageVal, () => {
            assertMetrics(testBucket, [timeStart, timeStart], {
                storageUtilized: [storageVal, storageVal],
            }, done);
        });
    });

    it('should return metrics for list bucket', done => {
        const val = 1;
        const t = new Date();
        t.setMinutes(0, 0, 0);
        const timeStart = t.getTime();
        const timespan = t.setHours(0);
        const key = genBucketKey(testBucket, 'listBucket', timespan);
        memBackend.zadd(key, timeStart, val, () => {
            assertMetrics(testBucket, [timeStart, timeStart], {
                operations: { 's3:ListBucket': 1 } }, done);
        });
    });
});
