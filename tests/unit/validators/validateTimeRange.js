const assert = require('assert');
const validateTimeRange = require('../../../validators/validateTimeRange');
const { getNormalizedTimestamp } = require('../../utils/utils');
const UtapiClient = require('../../../lib/UtapiClient');

describe('validateTimeRange', () => {
    const fifteenMinutes = (1000 * 60) * 15;

    it('should allow a current end time, if not provided', () => {
        const start = UtapiClient.getNormalizedTimestamp();
        const isValid = validateTimeRange([start]);
        assert.strictEqual(isValid, true);
    });

    it('should not allow a start time in the future', () => {
        const start = UtapiClient.getNormalizedTimestamp() + fifteenMinutes;
        const isValid = validateTimeRange([start]);
        assert.strictEqual(isValid, false);
    });

    it('should not allow a start time greater than the end time', () => {
        const start =
            UtapiClient.getNormalizedTimestamp() - (fifteenMinutes * 2);
        const end =
            UtapiClient.getNormalizedTimestamp() - (fifteenMinutes * 3) - 1;
        const isValid = validateTimeRange([start, end]);
        assert.strictEqual(isValid, false);
    });
});
