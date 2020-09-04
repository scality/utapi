const assert = require('assert');
const uuid = require('uuid');
const { mpuBucketPrefix } = require('arsenal/lib/constants');

const { Warp10Client } = require('../../../../libV2/warp10');
const { ReindexTask } = require('../../../../libV2/tasks');
const { BucketD, values } = require('../../../utils/mock/');
const { protobuf } = require('../../../utils/v2Data');

const { CANONICAL_ID, BUCKET_NAME } = values;
const bucketCounts = [1, 1001];

const bucketRecord = {
    ops: {},
    sizeD: 1024,
    objD: 1,
    inB: 0,
    outB: 0,
};

const accountRecord = {
    ops: {},
    sizeD: 2048,
    objD: 2,
    inB: 0,
    outB: 0,
};

// eslint-disable-next-line func-names
describe('Test ReindexTask', function () {
    this.timeout(1200000);

    let prefix;
    let warp10;
    let reindexTask;
    const bucketd = new BucketD(true);

    before(() => bucketd.start());

    beforeEach(() => {
        prefix = uuid.v4();
        reindexTask = new ReindexTask({ warp10: { nodeId: prefix } });
        reindexTask._program = { nodeId: prefix };
        warp10 = new Warp10Client({ nodeId: prefix });
    });

    afterEach(() => {
        bucketd.reset();
    });

    async function assertResult(labels, value) {
        const results = await warp10.fetch({
            className: 'utapi.repair.reindex',
            labels,
            start: 'now',
            stop: -100,
        });

        assert.strictEqual(results.result.length, 1);
        assert.notStrictEqual(results.result[0], '');
        const series = JSON.parse(results.result[0]);
        assert.strictEqual(series.length, 1);
        const record = protobuf.decode('Record', series[0].v[0][1]);
        assert.deepStrictEqual(record, value);
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
            await assertResult({ bck: mpuBucket, node: prefix }, bucketRecord);
            await assertResult({ acc: CANONICAL_ID, node: prefix }, accountRecord);
        });
    });
});
