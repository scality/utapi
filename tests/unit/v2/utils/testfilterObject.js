const assert = require('assert');
const { filterObject } = require('../../../../libV2/utils');

const testCases = [
    {
        filter: { allow: new Set(['foo', 'bar']) },
        value: 'foo',
        expected: true,
    },
    {
        filter: { allow: new Set(['foo', 'bar']) },
        value: 'baz',
        expected: false,
    },
    {
        filter: { deny: new Set(['foo', 'bar']) },
        value: 'foo',
        expected: false,
    },
    {
        filter: { deny: new Set(['foo', 'bar']) },
        value: 'baz',
        expected: true,
    },
];

describe'Test filterObject', () => {
    testCases.forEach(testCase => {
        const { value, expected, filter } = testCase;
        const successMsg = expected ? 'should not filter' : 'should filter';
        const state = (expected && filter.allow) || (!expected && filter.deny) ? '' : ' not';
        const ruleType = Object.keys(filter)[0];
        const msg = `${successMsg} object if value is${state} present in ${ruleType} list`;
        it(msg, () => {
            const func = filterObject('value', filter);
            assert.strictEqual(func({ value }), expected);
        });
    });

    it('should not filter an object if the filter key in undefined', () => {
        const func = filterObject('value', { allow: ['foo'] });
        assert.strictEqual(func({}), true);
    });

    it('should throw if creating a filter with both allow and deny lists', () => {
        assert.throws(() => filterObject('value', { allow: ['foo'], deny: ['bar'] }));
    });

    it('should throw if creating a filter without an allow or deny lists', () => {
        assert.throws(() => filterObject('value', {}));
    });
});
