const assert = require('assert');
const { filterObject, buildFilterChain } = require('../../../../libV2/utils');

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

describe('Test filterObject', () => {
    testCases.forEach(testCase => {
        const { value, expected, filter } = testCase;
        const successMsg = expected ? 'should not filter' : 'should filter';
        const state = (expected && filter.allow) || (!expected && filter.deny) ? '' : ' not';
        const ruleType = Object.keys(filter)[0];
        const msg = `${successMsg} object if value is${state} present in ${ruleType} list`;
        it(msg, () => {
            assert.strictEqual(filterObject({ value }, 'value', filter), expected);
        });
    });

    it('should not filter an object if the filter key is undefined', () => {
        assert.strictEqual(filterObject({}, 'value', { allow: new Set(['foo']) }), true);
    });

    it('should throw if creating a filter with both allow and deny lists', () => {
        assert.throws(() => filterObject('value', { allow: new Set(['foo']), deny: new Set(['bar']) }));
    });

    it('should throw if creating a filter without an allow or deny lists', () => {
        assert.throws(() => filterObject('value', {}));
    });
});


const chainTestCases = [
    {
        key1: { allow: new Set(['allow']) },
        key2: { allow: new Set(['allow']) },
        msg: 'test chain with multiple allow filters',
    },
    {
        key1: { deny: new Set(['deny']) },
        key2: { deny: new Set(['deny']) },
        msg: 'test chain with multiple deny filters',
    },
    {
        key1: { allow: new Set(['allow']) },
        key2: { deny: new Set(['deny']) },
        msg: 'test chain with an allow and a deny filter',
    },
];

describe('Test buildFilterChain', () => {
    chainTestCases.forEach(testCase => {
        const { key1, key2, msg } = testCase;
        describe(msg, () => {
            const chain = buildFilterChain({ key1, key2 });
            it('should return true when both keys are allow', () => {
                assert.strictEqual(chain({ key1: 'allow', key2: 'allow' }), true);
            });

            it('should return true when key1 is undefined and key2 is allow', () => {
                assert.strictEqual(chain({ key2: 'allow' }), true);
            });

            it('should return true when key1 is allow and key2 is undefined', () => {
                assert.strictEqual(chain({ key1: 'allow' }), true);
            });

            it('should return true when both keys are undefined', () => {
                assert.strictEqual(chain({}), true);
            });

            it('should return false when key1 is deny', () => {
                assert.strictEqual(chain({ key1: 'deny', key2: 'allow' }), false);
            });

            it('should return false when key2 is deny', () => {
                assert.strictEqual(chain({ key1: 'allow', key2: 'deny' }), false);
            });

            it('should return false when both keys are deny', () => {
                assert.strictEqual(chain({ key1: 'deny', key2: 'deny' }), false);
            });

            it('should return false when key1 is undefined and key2 is deny', () => {
                assert.strictEqual(chain({ key2: 'deny' }), false);
            });

            it('should return false when key1 is deny and key2 is undefined', () => {
                assert.strictEqual(chain({ key1: 'deny' }), false);
            });
        });
    });

    it('should return true is no filters are supplied', () => {
        const chain = buildFilterChain({});
        assert.strictEqual(chain({}), true);
    });
});
