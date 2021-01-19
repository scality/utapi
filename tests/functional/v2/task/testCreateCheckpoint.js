const assert = require('assert');
const uuid = require('uuid');

const { Warp10Client } = require('../../../../libV2/warp10');
const { convertTimestamp } = require('../../../../libV2/utils');
const { CreateCheckpoint } = require('../../../../libV2/tasks');

const { generateCustomEvents, fetchRecords } = require('../../../utils/v2Data');

const _now = Math.floor(new Date().getTime() / 1000);
const getTs = delta => convertTimestamp(_now + delta);

const checkpointLabelToLevel = {
    bck: 'buckets',
    acc: 'accounts',
    usr: 'users',
};

function assertCheckpoint(expected, checkpoint) {
    assert.strictEqual(checkpoint.inB, expected.in);
    assert.strictEqual(checkpoint.outB, expected.out);
    assert.strictEqual(checkpoint.objD, expected.count);
    assert.strictEqual(checkpoint.sizeD, expected.bytes);
    assert.deepStrictEqual(checkpoint.ops, expected.ops);
}

function assertResults(totals, series) {
    series.forEach(checkpoint => {
        const [[label, id]] = Object.entries(checkpoint.labels)
            .filter(([k]) => checkpointLabelToLevel[k] !== undefined);
        const level = checkpointLabelToLevel[label];
        assert.strictEqual(checkpoint.values.length, 1);
        assertCheckpoint(
            totals[level][id],
            checkpoint.values[0],
        );
    });
}

// eslint-disable-next-line func-names
describe('Test CreateCheckpoint', function () {
    this.timeout(10000);

    let prefix;
    let warp10;
    let checkpointTask;

    beforeEach(async () => {
        prefix = uuid.v4();
        checkpointTask = new CreateCheckpoint({ warp10: { nodeId: prefix } });
        checkpointTask._program = { lag: 0, nodeId: prefix };

        warp10 = new Warp10Client({ nodeId: prefix });
    });

    it('should create checkpoints from events', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const { events, totals } = generateCustomEvents(start, stop, 100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.checkpoint',
            { node: prefix },
            { end: getTs(1), count: 1 },
        );


        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should only include events not in an existing checkpoint', async () => {
        const accounts = { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } };

        const { events: historicalEvents } = generateCustomEvents(
            getTs(-500),
            getTs(-400),
            100,
            accounts,
        );

        const { events, totals } = generateCustomEvents(
            getTs(-400) + 1,
            getTs(-120),
            100,
            accounts,
        );

        await warp10.ingest({ className: 'utapi.event' }, historicalEvents);
        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(-400));
        await checkpointTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.checkpoint',
            { node: prefix },
            { end: getTs(1), count: 1 },
        );

        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should not create a checkpoint if no new events have occurred', async () => {
        const { events, totals } = generateCustomEvents(
            getTs(-300),
            getTs(-120),
            100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } },
        );

        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(-100));

        const series = await fetchRecords(
            warp10,
            'utapi.checkpoint',
            { node: prefix },
            { end: getTs(1), count: -1 },
        );

        assert.strictEqual(series.length, 3);
        assertResults(totals, series);

        await checkpointTask._execute(getTs(0));
        const results = await warp10.fetch({
            className: 'utapi.checkpoint', labels: { node: prefix }, start: getTs(1), stop: 10 * 1000 * 1000,
        });

        assert.strictEqual(JSON.parse(results.result[0]).length, 0);
    });
});
