const { errors } = require('arsenal');
const validateMetric = require('./validateMetric');
const validateTimeRange = require('./validateTimeRange');

const _keys = Symbol();
const _dict = Symbol();
const _error = Symbol();

/*
 * Map to link input with check functions
 */
const keyMap = new Map([
    ['buckets', validateMetric],
    ['accounts', validateMetric],
    ['users', validateMetric],
    ['service', validateMetric],
    ['timeRange', validateTimeRange],
]);

/*
 * Map to link input with error to return
 */
const keyError = new Map([
    ['buckets', errors.InvalidParameterValue],
    ['accounts', errors.InvalidParameterValue],
    ['users', errors.InvalidParameterValue],
    ['service', errors.InvalidParameterValue],
    ['timeRange', errors.InvalidParameterValue.customizeDescription(
        'Timestamps must be one of the following intervals for any day/hour' +
            ' (mm:ss:SS) - start must be one of [00:00:000, 15:00:000, ' +
            '30:00:000, 45:00:000], end must be one of [14:59:999,' +
            ' 29:59:999, 44:59:999, 59:59:999].'
    )],
]);

/**
 * Class to validate input from http request,
 * once create, input are immutable
 *
 * @class Validator
 */
class Validator {

    /**
     * Constructor
     * @param {object} keys - Key value object, form { key: (boolean:required) }
     * @param {object} dict - Http request input
     * @return {object} Instance of Validator
     */
    constructor(keys, dict) {
        this[_keys] = keys;
        this[_dict] = dict;
        this[_error] = null;
    }

    /**
     * Validates input data and required fields
     * @return {boolean} validation result
     */
    validate() {
        const keys = this[_keys];
        const dict = this[_dict];
        const valid = Object.keys(dict).every(item => {
            // ignore optional params
            if (keys[item] === undefined) {
                return true;
            }
            if (typeof keys[item] === 'boolean') {
                const check = keyMap.get(item);
                if (!check) {
                    const errmsg =
                        `Validator::validate()-> Invalid check for ${item}`;
                    throw new Error(errmsg);
                }
                // return error if check failed
                if (!check.apply(null, [dict[item]])) {
                    this[_error] = keyError.get(item);
                    return false;
                }
                return true;
            }
            // if not boolean
            this[_error] = errors.WrongFormat;
            return false;
        });
        return valid && Object.keys(keys).every(key => {
            if (keys[key] === true) {
                if (dict[key] === undefined) {
                    this[_error] = errors.WrongFormat;
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Returns validation error
     * @return {ArsenalError} arsenal error object
     */
    getValidationError() {
        return this[_error];
    }

    /**
     * Get request param
     *
     * @param {string} key - Key to retrieve
     * @return {*} Return the value matching with the key from user input
     * @throws {Error} Return an error if the key is not register in validator
     */
    get(key) {
        if (typeof this[_keys][key] === 'boolean') {
            const value = this[_dict][key];
            if (typeof value === 'object' && !(value instanceof Array)) {
                return Object.assign({}, value);
            }
            if (value instanceof Array) {
                return value.slice();
            }
            return value;
        }
        throw new Error(`Validator::get(${key})-> Invalid key`);
    }

    /**
     * Set key value
     *
     * @param {string} key - Key to set
     * @param {string | array} value - value to retrieve
     * @return {undefined}
     */
    set(key, value) {
        if (typeof this[_keys][key] === 'boolean') {
            this[_dict][key] = value;
            return;
        }
        throw new Error(`Validator::set(${key})-> Invalid key`);
    }

}

module.exports = Validator;
