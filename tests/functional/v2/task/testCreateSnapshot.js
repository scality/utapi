const assert = require('assert');
const uuid = require('uuid');

const { Warp10Client } = require('../../../../libV2/warp10');
const { convertTimestamp } = require('../../../../libV2/utils');
const { CreateCheckpoint, CreateSnapshot, RepairTask } = require('../../../../libV2/tasks');

const { generateCustomEvents, fetchRecords } = require('../../../utils/v2Data');

const _now = Math.floor(new Date().getTime() / 1000);
const getTs = delta => convertTimestamp(_now + delta);

const snapshotLabelToLevel = {
    bck: 'buckets',
    acc: 'accounts',
    usr: 'users',
};

function assertSnapshot(expected, snapshot) {
    assert.strictEqual(snapshot.inB, expected.in);
    assert.strictEqual(snapshot.outB, expected.out);
    assert.strictEqual(snapshot.objD, expected.count);
    assert.strictEqual(snapshot.sizeD, expected.bytes);
    assert.deepStrictEqual(snapshot.ops, expected.ops);
}

function assertResults(totals, series) {
    series.forEach(checkpoint => {
        const [[label, id]] = Object.entries(checkpoint.labels)
            .filter(([k]) => snapshotLabelToLevel[k] !== undefined);
        const level = snapshotLabelToLevel[label];
        assert.strictEqual(checkpoint.values.length, 1);
        assertSnapshot(
            totals[level][id],
            checkpoint.values[0],
        );
    });
}

// eslint-disable-next-line func-names
describe('Test CreateSnapshot', function () {
    this.timeout(10000);

    let prefix;
    let warp10;
    let checkpointTask;
    let repairTask;
    let snapshotTask;

    beforeEach(async () => {
        prefix = uuid.v4();
        warp10 = new Warp10Client({ nodeId: prefix });

        checkpointTask = new CreateCheckpoint({ warp10: [warp10] });
        checkpointTask._program = { lag: 0, nodeId: prefix };

        snapshotTask = new CreateSnapshot({ warp10: [warp10] });
        snapshotTask._program = { lag: 0, nodeId: prefix };

        repairTask = new RepairTask({ warp10: [warp10] });
        repairTask._program = { lag: 0, nodeId: prefix };

    });

    it('should create a snapshot from a checkpoint', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const { events, totals } = generateCustomEvents(start, stop, 100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(-1));
        await snapshotTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.snapshot',
            { node: prefix },
            { end: getTs(1), count: 1 },
        );

        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should create a snapshot from more than one checkpoint', async () => {
        const start = getTs(-500);
        const stop = getTs(-50);
        const { events, totals } = generateCustomEvents(start, stop, 500,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(-400));
        await checkpointTask._execute(getTs(-300));
        await checkpointTask._execute(getTs(-200));
        await checkpointTask._execute(getTs(-100));
        await checkpointTask._execute(getTs(-1));

        await snapshotTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.snapshot',
            { node: prefix },
            { end: getTs(1), count: 1 },
        );
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should include the results of the previous snapshot', async () => {
        const start = getTs(-500);
        const stop = getTs(-50);
        const { events, totals } = generateCustomEvents(start, stop, 500,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(-300));
        await snapshotTask._execute(getTs(-250));

        await checkpointTask._execute(getTs(-1));
        await snapshotTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.snapshot',
            { node: prefix },
            { end: getTs(1), count: 1 },
        );
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should not include checkpoints more recent than the execution timestamp', async () => {
        const accounts = { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } };
        const start = getTs(-500);
        const stop = getTs(-50);
        const { events, totals } = generateCustomEvents(start, stop, 500, accounts);

        await warp10.ingest({ className: 'utapi.event' }, events);
        await checkpointTask._execute(getTs(-1));

        const { events: newEvents } = generateCustomEvents(getTs(10), getTs(100), 100, accounts);
        await warp10.ingest({ className: 'utapi.event' }, newEvents);
        await checkpointTask._execute(getTs(100));

        await snapshotTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.snapshot',
            { node: prefix },
            { end: getTs(100), count: 1 },
        );
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should include any corrections', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const { events, totals } = generateCustomEvents(start, stop, 100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest({ className: 'utapi.repair.event' }, events);
        await repairTask._execute(getTs(-1));
        await snapshotTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.snapshot',
            { node: prefix },
            { end: getTs(1), count: 1 },
        );
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });
});
