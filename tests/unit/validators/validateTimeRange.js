import assert from 'assert';
import validateTimeRange from '../../../src/validators/validateTimeRange';
import { getNormalizedTimestamp } from '../../testUtils';

describe('validateTimeRange', () => {
    it('should not allow a start time in the future', () => {
        const start = Date.now() + (1000 * 60);
        const isValid = validateTimeRange([start]);
        assert.strictEqual(isValid, false);
    });

    it('should not allow an end time in the future', () => {
        const start = getNormalizedTimestamp();
        const end = Date.now() + (1000 * 60);
        const isValid = validateTimeRange([start, end]);
        assert.strictEqual(isValid, false);
    });

    it('should allow a current end time, if not provided', () => {
        const start = getNormalizedTimestamp();
        const isValid = validateTimeRange([start]);
        assert.strictEqual(isValid, true);
    });

    it('should not allow a start time greater than the end time', () => {
        const start = getNormalizedTimestamp() + 1;
        const end = getNormalizedTimestamp();
        const isValid = validateTimeRange([start, end]);
        assert.strictEqual(isValid, false);
    });
});