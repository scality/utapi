import map from 'async/map';

export default class Memory {
    constructor() {
        this.data = {};
    }

    set(key, value, cb) {
        process.nextTick(() => {
            this.data[key] = value;
            return cb(null, value);
        });
    }

    get(key, cb) {
        process.nextTick(() => cb(null, this.data[key]));
    }

    incr(key, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = 0;
            }
            return cb(null, this.data[key]++);
        });
    }

    zadd(key, score, value, cb) {
        process.nextTick(() => {
            if (this.data[key] === undefined) {
                this.data[key] = [];
            }
            const found = this.data[key].some(item =>
                JSON.stringify(item) === JSON.stringify([score, value]));
            if (!found) {
                this.data[key].push([score, value]);
                this.data[key].sort((a, b) => a[0] - b[0]);
            }
            return cb(null, value);
        });
    }

    zrangebyscore(key, min, max, cb) {
        process.nextTick(() => {
            let minKey;
            let maxKey;
            const result = [];
            this.data[key].some(item => {
                if (minKey !== undefined && maxKey !== undefined) {
                    return true;
                }
                if (minKey !== undefined && minKey <= item[0]) {
                    minKey = key;
                    return false;
                }
                if (maxKey !== undefined && maxKey >= item[0]) {
                    maxKey = key;
                    return false;
                }
                return false;
            });
            if (minKey !== undefined) {
                this.data[key].forEach(item => {
                    if (item[0] === minKey) {
                        result.push([null, item[1]]);
                    }
                });
            }
            if (maxKey !== undefined) {
                this.data[key].forEach(item => {
                    if (item[0] === maxKey) {
                        result.push([null, item[1]]);
                    }
                });
            }
            return cb(null, result);
        });
    }

    zrevragebyscore(key, min, max, cb) {
        return this.zrangebyscore(key, max, min, cb);
    }

    pipeline(cmds) {
        this.cmds = cmds;
        this.exec = cb => {
            process.nextTick(() => {
                map(this.cmds,
                    (item, next) => this[item.shift()](...item, next), cb);
            });
        };
    }
}
