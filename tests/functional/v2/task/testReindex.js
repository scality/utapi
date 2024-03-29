const assert = require('assert');
const sinon = require('sinon');
const uuid = require('uuid');
const { constants: arsenalConstants, models: arsenalModels } = require('arsenal');

const { Warp10Client } = require('../../../../libV2/warp10');
const { ReindexTask } = require('../../../../libV2/tasks');
const { now } = require('../../../../libV2/utils');
const { BucketD, values } = require('../../../utils/mock/');
const { fetchRecords } = require('../../../utils/v2Data');

const { mpuBucketPrefix } = arsenalConstants;
const { ObjectMD } = arsenalModels;
const { CANONICAL_ID, BUCKET_NAME, OBJECT_KEY } = values;
const bucketCounts = [1, 251];

const bucketRecord = {
    sizeD: 2048,
    objD: 1,
};

const accountRecord = {
    sizeD: 2048,
    objD: 1,
};


// eslint-disable-next-line func-names
describe('Test ReindexTask', function () {
    this.timeout(120000);

    let prefix;
    let warp10;
    let reindexTask;
    const bucketd = new BucketD(true);

    before(() => bucketd.start());

    beforeEach(() => {
        prefix = uuid.v4();
        warp10 = new Warp10Client({ nodeId: prefix });
        reindexTask = new ReindexTask({ warp10: [warp10] });
        reindexTask._program = { bucket: [], nodeId: prefix };
    });

    afterEach(() => {
        bucketd.reset();
    });

    async function fetchReindex(labels) {
        return fetchRecords(
            warp10,
            'utapi.repair.reindex',
            labels,
            { end: now(), count: -100 },
            '@utapi/decodeRecord',
        );
    }

    describe('test different bucket listing lengths', () => {
        async function assertResult(labels, value) {
            const series = await fetchReindex(labels);
            assert.strictEqual(series.length, 1);
            assert.strictEqual(series[0].values.length, 1);
            assert.deepStrictEqual(series[0].values[0], value);
        }

        bucketCounts.forEach(count => {
            it(`should reindex bucket listing with a length of ${count}`, async () => {
                const bucket = `${BUCKET_NAME}-${count}`;
                const mpuBucket = `${mpuBucketPrefix}${bucket}`;
                bucketd
                    .setBucketContent({
                        bucketName: bucket,
                        contentLength: 1024,
                    })
                    .setBucketContent({
                        bucketName: mpuBucket,
                        contentLength: 1024,
                    })
                    .setBucketCount(count)
                    .createBuckets();

                await reindexTask._execute();
                await assertResult({ bck: bucket, node: prefix }, bucketRecord);
                await assertResult({ acc: CANONICAL_ID, node: prefix }, accountRecord);
            });
        });
    });

    describe('test invalid responses from warp 10', () => {
        let warp10Stub;
        beforeEach(() => {
            warp10Stub = sinon.stub(warp10, 'exec');
        });

        afterEach(() => sinon.restore());

        it('should rethrow an error', async () => {
            warp10Stub = warp10Stub.rejects();
            assert.rejects(() => reindexTask._fetchCurrentMetrics('bck', BUCKET_NAME));
        });

        it('should throw if an empty response is returned', async () => {
            warp10Stub = warp10Stub.callsFake(async () => ({ result: undefined }));
            assert.rejects(() => reindexTask._fetchCurrentMetrics('bck', BUCKET_NAME));
        });

        it('should throw if an empty stack is returned', async () => {
            warp10Stub = warp10Stub.callsFake(async () => ({ result: [] }));
            assert.rejects(() => reindexTask._fetchCurrentMetrics('bck', BUCKET_NAME));
        });

        it('should throw if objD is not an integer', async () => {
            warp10Stub = warp10Stub.callsFake(async () => ({ result: [{ objD: null, sizeD: 1 }] }));
            assert.rejects(() => reindexTask._fetchCurrentMetrics('bck', BUCKET_NAME));
        });

        it('should throw if sizeD is not an integer', async () => {
            warp10Stub = warp10Stub.callsFake(async () => ({ result: [{ objD: 1, sizeD: null }] }));
            assert.rejects(() => reindexTask._fetchCurrentMetrics('bck', BUCKET_NAME));
        });
    });

    describe('test invalid responses from bucketd', () => {
        let bucketDStub;
        beforeEach(() => {
            bucketDStub = sinon.stub(bucketd, '_getBucketResponse');
        });

        afterEach(() => sinon.restore());

        it('should skip object if content-length is not an integer', async () => {
            bucketDStub = bucketDStub.callsFake(
                () => {
                    const metadata = new ObjectMD().getValue();
                    // null value taken from error seen in the field
                    metadata['content-length'] = null;
                    return [
                        {
                            key: OBJECT_KEY,
                            value: JSON.stringify(metadata),
                        },
                    ];
                },
            );
            const resp = await ReindexTask._indexBucket('foo');
            assert.deepStrictEqual(resp, { size: 0, count: 0 });
        });
    });


    it('should avoid calculating incorrect reindex diffs', async () => {
        const bucketName = `${BUCKET_NAME}-1`;
        bucketd
            .setBucketContent({
                bucketName,
                contentLength: 1024,
            })
            .setBucketContent({
                bucketName: `${mpuBucketPrefix}${bucketName}`,
                contentLength: 1024,
            })
            .setBucketCount(2)
            .createBuckets();

        await reindexTask._execute();
        let series = await fetchReindex({ bck: bucketName, node: prefix });
        assert.strictEqual(series.length, 1);
        assert.strictEqual(series[0].values.length, 1);
        assert.deepStrictEqual(series[0].values[0], bucketRecord);

        // A second run of reindex should generate the same diff
        await reindexTask._execute();
        series = await fetchReindex({ bck: bucketName, node: prefix });
        assert.strictEqual(series.length, 1);
        assert.strictEqual(series[0].values.length, 2);
        series[0].values.map(value => assert.deepStrictEqual(value, bucketRecord));
    });

    describe('exponential backoff', () => {
        it('should retry when bucketd is unreachable', done => {
            // disable bucketd to simulate downtime
            bucketd.end();

            const bucketDStub = sinon.stub(bucketd, '_getBucketResponse');
            bucketDStub.onFirstCall().callsFake(
                // Once the timeout promise resolves, bucketd is able to be called.
                // If we make a call after 10 seconds, this shows that retries
                // have been occuring during bucketd downtime.
                () => {
                    return {
                        key: 'foo',
                        value: 'bar',
                    };
                },
            );

            const reindexPromise = new Promise((resolve, reject) => {
                reindexTask._execute()
                    .then(() => {
                        resolve('reindexed');
                    })
                    .catch(err => {
                        reject(err);
                    });
            });

            const timeoutPromise = new Promise(resolve => {
                const f = () => {
                    bucketd.start();
                    resolve();
                };
                setTimeout(f, 10000);
            });

            Promise.all([reindexPromise, timeoutPromise])
                .then(values => {
                    assert.strictEqual(values[0], 'reindexed');
                    sinon.restore();
                    done();
                });
        });
    });
});
