import assert from 'assert';
import validateTimeRange from '../../../src/validators/validateTimeRange';
import { getNormalizedTimestamp } from '../../utils/utils';

describe('validateTimeRange', () => {
    const fifteenMinutes = (1000 * 60) * 15;

    it('should allow a current end time, if not provided', () => {
        const start = getNormalizedTimestamp();
        const isValid = validateTimeRange([start]);
        assert.strictEqual(isValid, true);
    });

    it('should not allow a start time in the future', () => {
        const start = getNormalizedTimestamp() + fifteenMinutes;
        const isValid = validateTimeRange([start]);
        assert.strictEqual(isValid, false);
    });

    it('should not allow a start time greater than the end time', () => {
        const start = getNormalizedTimestamp() - (fifteenMinutes * 2);
        const end = getNormalizedTimestamp() - (fifteenMinutes * 3) - 1;
        const isValid = validateTimeRange([start, end]);
        assert.strictEqual(isValid, false);
    });
});
