import map from 'async/map';

/**
* Pipeline - executes multiple commands sent as a batch
*/
class Pipeline {
    /**
    * @constructor
    * @param {array[]} cmds - array of commands
    * typical usage looks like [['set', 'foo', 'bar'], ['get', 'foo']]
    * @param {Memory} db - Memory instance
    */
    constructor(cmds, db) {
        this.cmds = cmds;
        this.db = db;
    }

    /**
    * @param {callback} cb - callback
    * @return {undefined}
    */
    exec(cb) {
        process.nextTick(() => {
            // e.g. [['set', 'foo', 'bar'], ['get', 'foo']]
            map(this.cmds, (item, next) => {
                // ['set', 'foo', 'bar']
                const fnName = item.shift();
                // arg1 = 'foo', arg2 = 'bar', arg2 = undefined
                const [arg1, arg2, arg3] = item;
                if (arg1 !== undefined && arg2 !== undefined
                    && arg3 !== undefined) {
                    return this.db[fnName](arg1, arg2, arg3,
                        (err, res) => next(null, [err, res]));
                }
                if (arg1 !== undefined && arg2 !== undefined) {
                    return this.db[fnName](arg1, arg2,
                        (err, res) => next(null, [err, res]));
                }
                return this.db[fnName](arg1,
                    (err, res) => next(null, [err, res]));
            }, cb);
        });
    }
}

/**
* Memory backend which emulates IoRedis client methods
*/
export default class Memory {
    constructor() {
        this.data = {};
    }

    /**
    * Set key to hold a value
    * @param {string} key - data key
    * @param {string} value - data value
    * @param {callback} cb - callback
    * @return {undefined}
    */
    set(key, value, cb) {
        process.nextTick(() => {
            this.data[key] = value;
            return cb(null, value);
        });
    }

    /**
    * Get value from a key
    * @param {string} key - data key
    * @param {callback} cb - callback
    * @return {undefined}
    */
    get(key, cb) {
        process.nextTick(() => cb(null, this.data[key] === undefined ?
            null : this.data[key]));
    }

    /**
    * Increment value held by the key by 1
    * @param {string} key - data key
    * @param {callback} cb - callback
    * @return {undefined}
    */
    incr(key, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = 0;
            }
            return cb(null, this.data[key]++);
        });
    }

    /**
    * Increment value held by the key by the given number
    * @param {string} key - data key
    * @param {number} num - number to increment by
    * @param {callback} cb - callback
    * @return {undefined}
    */
    incrby(key, num, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = 0;
            }
            this.data[key] += num;
            return cb(null, this.data[key]);
        });
    }

    /**
    * Decrement value held by the key by 1
    * @param {string} key - data key
    * @param {callback} cb - callback
    * @return {undefined}
    */
    decr(key, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = 0;
            }
            return cb(null, this.data[key]--);
        });
    }

    /**
    * Decrement value held by the key by the given number
    * @param {string} key - data key
    * @param {number} num - number to increment by
    * @param {callback} cb - callback
    * @return {undefined}
    */
    decrby(key, num, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = 0;
            }
            this.data[key] -= num;
            return cb(null, this.data[key]);
        });
    }

    /**
    * Store value by score in a sorted set
    * @param {string} key - data key
    * @param {number} score - data score
    * @param {number} value - data value
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zadd(key, score, value, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = [];
            }
            // compares both arrays of data
            const found = this.data[key].some(item =>
                JSON.stringify(item) === JSON.stringify([score, value]));
            if (!found) {
                // as this is a sorted set emulation, it sorts the data by score
                // after each insertion
                this.data[key].push([score, value]);
                this.data[key].sort((a, b) => a[0] - b[0]);
            }
            return cb(null, value);
        });
    }

    /**
    * Returns range result from sorted set at key with scores between min and
    * max (all inclusive). Ordering is from low to high scores
    * @param {string} key - data key
    * @param {string|number} min - min score (number or -inf)
    * @param {string|number} max - max score (number or +inf)
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zrangebyscore(key, min, max, cb) {
        process.nextTick(() => {
            if (!this.data[key]) {
                // emulating redis-client which returns nulls
                return cb(null, null);
            }
            const minScore = (min === '-inf') ? this.data[key][0][0] : min;
            const maxScore = (min === '+inf') ?
                this.data[key][this.data[key].length - 1][0] : max;
            return cb(null, this.data[key].filter(item => item[0] >= minScore
                && item[0] <= maxScore).map(item => item[1]));
        });
    }

    /**
    * Returns range result from sorted set at key with scores between min and
    * max (all inclusive). Ordering is from high to low scores
    * @param {string} key - data key
    * @param {string|number} max - max score (number or +inf)
    * @param {string|number} min - min score (number or -inf)
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zrevrangebyscore(key, max, min, cb) {
        process.nextTick(() => {
            if (!this.data[key]) {
                // emulating redis-client which returns nulls
                return cb(null, null);
            }
            const minScore = (min === '-inf') ? this.data[key][0][0] : min;
            const maxScore = (min === '+inf') ?
                this.data[key][this.data[key].length][0] : max;
            const cloneKeyData = Object.assign(this.data[key]);
            // Sort keys by scores in the decreasing order, if scores are equal
            // sort by their value in the decreasing order
            cloneKeyData.sort((a, b) => {
                if (a[0] === b[0]) {
                    return b[1] - a[1];
                }
                return b[0] - a[0];
            });
            return cb(null, cloneKeyData.filter(item => item[0] >= minScore
                && item[0] <= maxScore).map(item => item[1]));
        });
    }

    /**
    * Returns a pipeline instance that can execute commmands as a batch
    * @param {array} cmds - list of commands
    * @return {Pipeline} - Pipeline instance
    */
    pipeline(cmds) {
        return new Pipeline(cmds, this);
    }

    /**
    * Flushes(clears) the data out from db
    * @return {object} - current instance
    */
    flushDb() {
        this.data = {};
        return this;
    }
}
