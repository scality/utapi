import assert from 'assert';
import ListMetrics from '../../src/lib/ListMetrics';
import { buildMockResponse } from '../testUtils';

const MAX_RANGE_MS = (((1000 * 60) * 60) * 24) * 30; // One month.

describe('ListMetrics', () => {
    const listMetrics = new ListMetrics();

    describe('::_buildSubRanges', () => {
        const tests = [
            {
                range: [0, MAX_RANGE_MS - 1],
                expected: [[0, MAX_RANGE_MS - 1]],
            },
            {
                range: [0, (MAX_RANGE_MS * 2) - 1],
                expected: [
                    [0, MAX_RANGE_MS - 1],
                    [MAX_RANGE_MS, (MAX_RANGE_MS * 2) - 1],
                ],
            },
        ];
        tests.forEach(test => {
            const { range, expected } = test;
            it(`should create sub-ranges, given range ${range}`, () => {
                const ranges = listMetrics._buildSubRanges(range);
                assert.deepStrictEqual(ranges, expected);
            });
        });

        it('should set end date to the current time if not provided', () => {
            const testStartTime = Date.now();
            const range = [testStartTime - ((1000 * 60) * 15)];
            const ranges = listMetrics._buildSubRanges(range);
            assert.strictEqual(ranges.length, 1);
            assert.strictEqual(ranges[0][0], range[0]);
            assert(ranges[0][1] >= testStartTime && ranges[0][1] <= Date.now());
        });
    });

    describe('::_reduceResults', () => {
        const tests = [
            {
                results: [
                    buildMockResponse({ start: 0, end: 1, val: 1 }),
                ],
                expected:
                    buildMockResponse({ start: 0, end: 1, val: 1 }),
            },
            {
                results: [
                    buildMockResponse({ start: 0, end: 1, val: 1 }),
                    buildMockResponse({ start: 2, end: 3, val: 1 }),
                ],
                expected:
                    buildMockResponse({ start: 0, end: 3, val: 2 }),
            },
        ];
        tests.forEach(test => {
            const { results, expected } = test;
            const result = listMetrics._reduceResults(results);
            it(`should reduce ${results.length} result(s)`, () =>
                assert.deepStrictEqual(result, expected));
        });
    });
});
