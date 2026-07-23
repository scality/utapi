const assert = require('assert');
const sinon = require('sinon');

const { errors } = require('arsenal');
const { BucketInfo } = require('arsenal').models;
const client = require('../../../libV2/metadata/client');
const metadata = require('../../../libV2/metadata');

function bucketMD(replicationConfiguration) {
    return new BucketInfo(
        'test-bucket', 'test-canonical-id', 'test-owner', '2026-01-01T00:00:00.000Z',
        undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, replicationConfiguration,
    ).serialize();
}

const v1ReplicationConfig = {
    role: 'arn:aws:iam::123:role/src,arn:aws:iam::123:role/dst',
    destination: 'arn:aws:s3:::dest-bucket',
    rules: [{
        id: 'rule-1', prefix: '', enabled: true, storageClass: 'site2',
    }],
};

const v2ReplicationConfig = {
    role: 'arn:aws:iam::123:role/src,arn:aws:iam::123:role/dst',
    rules: [{
        id: 'rule-1', enabled: true, storageClass: 'site2', destination: 'arn:aws:s3:::dest-bucket',
    }],
    format: 'v2',
};

describe('Test metadata client', () => {
    let getBucketAttributesStub;

    beforeEach(() => {
        getBucketAttributesStub = sinon.stub(client.client, 'getBucketAttributes');
    });

    afterEach(() => sinon.restore());

    function respondWith(err, data) {
        getBucketAttributesStub.callsFake((_bucket, _uids, cb) => cb(err, data));
    }

    describe('getBucket', () => {
        it('should parse bucket metadata with a V1 replication configuration', async () => {
            respondWith(null, bucketMD(v1ReplicationConfig));
            const bucket = await metadata.getBucket('test-bucket');
            assert.strictEqual(bucket.getOwner(), 'test-canonical-id');
            assert.strictEqual(bucket.getReplicationConfiguration().destination, 'arn:aws:s3:::dest-bucket');
        });

        it('should parse bucket metadata with a V2 replication configuration', async () => {
            respondWith(null, bucketMD(v2ReplicationConfig));
            const bucket = await metadata.getBucket('test-bucket');
            assert.strictEqual(bucket.getOwner(), 'test-canonical-id');
            assert.strictEqual(bucket.getReplicationConfiguration().rules[0].destination, 'arn:aws:s3:::dest-bucket');
        });

        it('should parse a multi-destination (multi-CRR) V2 replication configuration', async () => {
            const config = {
                ...v2ReplicationConfig,
                rules: [
                    {
                        id: 'rule-1', enabled: true, storageClass: 'site2', destination: 'arn:aws:s3:::dest-1',
                    },
                    {
                        id: 'rule-2', enabled: true, prefix: 'foo/', storageClass: 'site3',
                        destination: 'arn:aws:s3:::dest-2', account: '123456789012',
                    },
                ],
            };
            respondWith(null, bucketMD(config));
            const bucket = await metadata.getBucket('test-bucket');
            assert.strictEqual(bucket.getOwner(), 'test-canonical-id');
            const replication = bucket.getReplicationConfiguration();
            assert.strictEqual(replication.destination, undefined);
            assert.deepStrictEqual(replication.rules.map(rule => rule.destination),
                ['arn:aws:s3:::dest-1', 'arn:aws:s3:::dest-2']);
        });

        it('should parse bucket metadata without a replication configuration', async () => {
            respondWith(null, bucketMD(undefined));
            const bucket = await metadata.getBucket('test-bucket');
            assert.strictEqual(bucket.getOwner(), 'test-canonical-id');
        });

        it('should reject on client error', async () => {
            respondWith(errors.InternalError, null);
            await assert.rejects(metadata.getBucket('test-bucket'), err => err.is.InternalError);
        });
    });

    describe('bucketExists', () => {
        it('should resolve true when the bucket exists', async () => {
            respondWith(null, bucketMD(v2ReplicationConfig));
            assert.strictEqual(await metadata.bucketExists('test-bucket'), true);
        });

        it('should resolve false when the bucket does not exist', async () => {
            respondWith(errors.NoSuchBucket, null);
            assert.strictEqual(await metadata.bucketExists('test-bucket'), false);
        });

        it('should reject on other errors', async () => {
            respondWith(errors.InternalError, null);
            await assert.rejects(metadata.bucketExists('test-bucket'), err => err.is.InternalError);
        });
    });
});
