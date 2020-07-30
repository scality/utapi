const assert = require('assert');
const uuid = require('uuid');

const { Warp10Client } = require('../../../../libV2/warp10');
const { convertTimestamp } = require('../../../../libV2/utils');
const { CreateCheckpoint, CreateSnapshot } = require('../../../../libV2/tasks');

const { generateCustomEvents, protobuf } = require('../../../utils/v2Data');

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
        const [[label, id]] = Object.entries(checkpoint.l)
            .filter(([k]) => snapshotLabelToLevel[k] !== undefined);
        const level = snapshotLabelToLevel[label];
        assert.strictEqual(checkpoint.v.length, 1);
        assertSnapshot(
            totals[level][id],
            protobuf.decode('Record', checkpoint.v[0][1]),
        );
    });
}

// eslint-disable-next-line func-names
describe('Test CreateSnapshot', function () {
    this.timeout(10000);

    let prefix;
    let warp10;
    let checkpointTask;
    let snapshotTask;

    beforeEach(async () => {
        prefix = uuid.v4();
        checkpointTask = new CreateCheckpoint({ warp10: { nodeId: prefix } });
        checkpointTask._program = { lag: 0, nodeId: prefix };

        snapshotTask = new CreateSnapshot({ warp10: { nodeId: prefix } });
        snapshotTask._program = { lag: 0, nodeId: prefix };

        warp10 = new Warp10Client({ nodeId: prefix });
    });

    it('should create a snapshot from a checkpoint', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const { events, totals } = generateCustomEvents(start, stop, 100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest('utapi.event', events);
        await checkpointTask._execute(getTs(-1));
        await snapshotTask._execute(getTs(0));

        const results = await warp10.fetch({
            className: 'utapi.snapshot', labels: { node: prefix }, start: getTs(1), stop: -1,
        });

        const series = JSON.parse(results.result[0]);
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should create a snapshot from more than one checkpoint', async () => {
        const start = getTs(-500);
        const stop = getTs(-50);
        const { events, totals } = generateCustomEvents(start, stop, 500,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest('utapi.event', events);
        await checkpointTask._execute(getTs(-400));
        await checkpointTask._execute(getTs(-300));
        await checkpointTask._execute(getTs(-200));
        await checkpointTask._execute(getTs(-100));
        await checkpointTask._execute(getTs(-1));

        await snapshotTask._execute(getTs(0));

        const results = await warp10.fetch({
            className: 'utapi.snapshot', labels: { node: prefix }, start: getTs(1), stop: -1,
        });

        const series = JSON.parse(results.result[0]);
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should include the results of the previous snapshot', async () => {
        const start = getTs(-500);
        const stop = getTs(-50);
        const { events, totals } = generateCustomEvents(start, stop, 500,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest('utapi.event', events);
        await checkpointTask._execute(getTs(-300));
        await snapshotTask._execute(getTs(-250));

        await checkpointTask._execute(getTs(-1));
        await snapshotTask._execute(getTs(0));

        const results = await warp10.fetch({
            className: 'utapi.snapshot', labels: { node: prefix }, start: getTs(1), stop: -1,
        });

        const series = JSON.parse(results.result[0]);
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should not include checkpoints more recent than the execution timestamp', async () => {
        const accounts = { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } };
        const start = getTs(-500);
        const stop = getTs(-50);
        const { events, totals } = generateCustomEvents(start, stop, 500, accounts);

        await warp10.ingest('utapi.event', events);
        await checkpointTask._execute(getTs(-1));

        const { events: newEvents } = generateCustomEvents(getTs(10), getTs(100), 100, accounts);
        await warp10.ingest('utapi.event', newEvents);
        await checkpointTask._execute(getTs(100));

        await snapshotTask._execute(getTs(0));

        const results = await warp10.fetch({
            className: 'utapi.snapshot', labels: { node: prefix }, start: getTs(1), stop: -1,
        });

        const series = JSON.parse(results.result[0]);
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });
});
