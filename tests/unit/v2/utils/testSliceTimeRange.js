const assert = require('assert');

const { sliceTimeRange } = require('../../../../libV2/utils');

const testCases = [
    {
        start: 0,
        end: 5,
        step: 1,
        expected: [
            [0, 0],
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 5],
        ],
    },
    {
        start: 0,
        end: 10,
        step: 2,
        expected: [
            [0, 1],
            [2, 3],
            [4, 5],
            [6, 7],
            [8, 9],
            [10, 10],
        ],
    },
    {
        start: 0,
        end: 10,
        step: 3,
        expected: [
            [0, 2],
            [3, 5],
            [6, 8],
            [9, 10],
        ],
    },
    {
        start: 0,
        end: 10,
        step: 4,
        expected: [
            [0, 3],
            [4, 7],
            [8, 10],
        ],
    },
    {
        start: 0,
        end: 10,
        step: 5,
        expected: [
            [0, 4],
            [5, 9],
            [10, 10],
        ],
    },
    {
        start: 0,
        end: 10,
        step: 6,
        expected: [
            [0, 5],
            [6, 10],
        ],
    },
    {
        start: 0,
        end: 10,
        step: 11,
        expected: [
            [0, 10],
        ],
    },
];


describe('Test sliceTimeRange', () => {
    testCases.forEach(testCase => {
        const {
            start, end, step, expected,
        } = testCase;
        it(`should correctly slice range ${start}-${end} with step ${step}`, () => {
            const results = [];
            // eslint-disable-next-line no-restricted-syntax
            for (const item of sliceTimeRange(start, end, step)) {
                results.push(item);
            }

            assert.deepStrictEqual(results, expected);
        });
    });
});
