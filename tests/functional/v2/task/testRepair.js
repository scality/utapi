const assert = require('assert');
const uuid = require('uuid');

const { Warp10Client } = require('../../../../libV2/warp10');
const { convertTimestamp } = require('../../../../libV2/utils');
const { RepairTask } = require('../../../../libV2/tasks');

const { generateCustomEvents, fetchRecords } = require('../../../utils/v2Data');

// Ten minutes in the past
const _now = Math.floor(new Date().getTime() / 1000) - (600);
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
describe('Test Repair', function () {
    this.timeout(10000);

    let prefix;
    let warp10;
    let repairTask;

    beforeEach(async () => {
        prefix = uuid.v4();
        repairTask = new RepairTask({ warp10: { nodeId: prefix } });
        repairTask._program = { lag: 0, nodeId: prefix };

        warp10 = new Warp10Client({ nodeId: prefix });
    });

    it('should create corrections from events', async () => {
        const start = getTs(-300);
        const stop = getTs(-120);
        const { events, totals } = generateCustomEvents(start, stop, 100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } });

        await warp10.ingest({ className: 'utapi.repair.event' }, events);
        await repairTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.repair.correction',
            { node: prefix },
            { end: getTs(1), count: -1 },
            '@utapi/decodeRecord',
        );

        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should only include events not in an existing correction', async () => {
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

        await warp10.ingest({ className: 'utapi.repair.event' }, historicalEvents);
        await warp10.ingest({ className: 'utapi.repair.event' }, events);
        await repairTask._execute(getTs(-400));
        await repairTask._execute(getTs(0));

        const series = await fetchRecords(
            warp10,
            'utapi.repair.correction',
            { node: prefix },
            { end: getTs(1), count: 1 },
            '@utapi/decodeRecord',
        );
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);
    });

    it('should not create a correction if no new events have occurred', async () => {
        const { events, totals } = generateCustomEvents(
            getTs(-300),
            getTs(-120),
            100,
            { [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] } },
        );

        await warp10.ingest({ className: 'utapi.repair.event' }, events);
        await repairTask._execute(getTs(-100));

        const series = await fetchRecords(
            warp10,
            'utapi.repair.correction',
            { node: prefix },
            { end: getTs(1), count: -1 },
            '@utapi/decodeRecord',
        );
        assert.strictEqual(series.length, 3);
        assertResults(totals, series);

        await repairTask._execute(getTs(0));
        const results = await fetchRecords(
            warp10,
            'utapi.repair.correction',
            { node: prefix },
            { start: getTs(1), end: getTs(10 * 1000 * 1000) },
            '@utapi/decodeRecord',
        );
        assert.strictEqual(results.length, 0);
    });
});
