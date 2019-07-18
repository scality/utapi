const assert = require('assert');
const uuid = require('uuid/v4');
const member = require('../../utils/member');

describe('Sorted set member serialization', () => {
    describe('serialize', () => {
        it('should serialize the value', () => {
            const value = '1';
            const result = member.serialize(value);
            assert(result.startsWith(`${value}:`));
        });
    });

    describe('deserialize', () => {
        it('should deserialize the member', () => {
            const value = '1';
            const result = member.deserialize(`${value}:${uuid()}`);
            assert.strictEqual(result, value);
        });
    });

    describe('serialize and deserialize', () => {
        it('should serialize and deserialize the value', () => {
            const value = '1';
            const result = member.serialize(value);
            assert.strictEqual(member.deserialize(result), value);
        });
    });
});
