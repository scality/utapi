/* Provides methods for operations on a datastore */
class Datastore {
    /**
    * @constructor
    */
    constructor() {
        this._client = null;
    }

    /**
    * set client, enables switching between different backends
    * @param {object} client - client providing interface to the datastore
    * @return {undefined}
    */
    setClient(client) {
        this._client = client;
        return this;
    }

    /**
    * retrieve client object containing backend interfaces
    * @return {object} client - client providing interface to the datastore
    */
    getClient() {
        return this._client;
    }

    /**
    * set key to hold the string value
    * @param {string} key - key holding the value
    * @param {string} value - value containing the data
    * @param {callback} cb - callback
    * @return {undefined}
    */
    set(key, value, cb) {
        return this._client.set(key, value, cb);
    }

    /**
    * Set the replay lock key (if it does not already exist) with an expiration
    * @param {string} key - key to set with an expiration
    * @param {string} value - value containing the data
    * @param {string} ttl - time after which the key expires
    * @return {undefined}
    */
    setExpire(key, value, ttl) {
        // This method is a Promise because no callback is given.
        return this._client.set(key, value, 'EX', ttl, 'NX');
    }

    /**
    * delete a key
    * @param {string} key - key to delete
    * @return {undefined}
    */
    del(key) {
        return this._client.del(key);
    }

    /**
    * get value from a key
    * @param {string} key - key holding the value
    * @param {callback} cb - callback
    * @return {undefined}
    */
    get(key, cb) {
        return this._client.get(key, cb);
    }

    /**
    * increment value of a key by 1
    * @param {string} key - key holding the value
    * @param {callback} cb - callback
    * @return {undefined}
    */
    incr(key, cb) {
        return this._client.incr(key, cb);
    }

    /**
    * decrement value of a key by 1
    * @param {string} key - key holding the value
    * @param {callback} cb - callback
    * @return {undefined}
    */
    decr(key, cb) {
        return this._client.decr(key, cb);
    }

    /**
    * decrement value of a key by the provided value
    * @param {string} key - key holding the value
    * @param {string} value - value containing the data
    * @param {callback} cb - callback
    * @return {undefined}
    */
    decrby(key, value, cb) {
        return this._client.decrby(key, value, cb);
    }

    /**
    * set value of a key in a sorted set with a score
    * @param {string} key - key holding the value
    * @param {number} score - integer score for the key in the sorted set
    * @param {string} value - value containing the data
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zadd(key, score, value, cb) {
        return this._client.zadd(key, score, value, cb);
    }

    /**
    * get a list of results containing values whose keys fall within the
    * min and max range
    * @param {string} key - key holding the value
    * @param {number} min - integer for start range (inclusive)
    * @param {number} max - integer for end range (inclusive)
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zrange(key, min, max, cb) {
        return this._client.zrange(key, min, max, cb);
    }

    /**
    * get a list of results containing values whose keys fall within the
    * min and max scores
    * @param {string} key - key holding the value
    * @param {number} min - integer score for start range (inclusive)
    * @param {number} max - integer score for end range (inclusive)
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zrangebyscore(key, min, max, cb) {
        return this._client.zrangebyscore(key, min, max, cb);
    }

    /**
    * batch get a list of results containing values whose keys fall within the
    * min and max scores
    * @param {string[]} keys - list of keys
    * @param {number} min - integer score for start range (inclusive)
    * @param {number} max - integer score for end range (inclusive)
    * @param {callback} cb - callback
    * @return {undefined}
    */
    bZrangebyscore(keys, min, max, cb) {
        return this._client.pipeline(keys.map(
            item => ['zrangebyscore', item, min, max])).exec(cb);
    }

    /**
    * execute a batch of commands
    * @param {string[]} cmds - list of commands
    * @param {callback} cb - callback
    * @return {undefined}
    */
    batch(cmds, cb) {
        return this._client.multi(cmds).exec(cb);
    }

    /**
    * execute a pipeline of commands
    * @param {string[]} cmds - list of commands
    * @param {callback} cb - callback
    * @return {undefined}
    */
    pipeline(cmds, cb) {
        return this._client.pipeline(cmds).exec(cb);
    }

    /**
    * remove elements from the sorted set that fall between the min and max
    * scores
    * @param {string} key - key holding the value
    * @param {number} min - integer score for start range (inclusive)
    * @param {number} max - integer score for end range (inclusive)
    * @param {callback} cb - callback
    * @return {undefined}
    */
    zremrangebyscore(key, min, max, cb) {
        return this._client.zremrangebyscore(key, min, max, cb);
    }

    /**
    * push a value to the head of the list
    * @param {string} key - key for the list
    * @param {string} val - value to be pushed onto the list
    * @param {callback} cb - callback
    * @return {undefined}
    */
    lpush(key, val, cb) {
        return this._client.lpush(key, val, cb);
    }

    /**
    * remove and return the last element of the list
    * @param {string} key - key for the list
    * @param {callback} cb - callback
    * @return {undefined}
    */
    rpop(key, cb) {
        return this._client.rpop(key, cb);
    }

    /**
    * get a range of elements from the list
    * @param {string} key - key for the list
    * @param {number} start - start offset in a zero-based index
    * @param {number} stop - stop offset in a zero-based index
    * @param {callback} cb - callback
    * @return {undefined}
    */
    lrange(key, start, stop, cb) {
        return this._client.lrange(key, start, stop, cb);
    }

    /**
    * get the length of the list
    * @param {string} key - key for the list
    * @param {callback} cb - callback
    * @return {undefined}
    */
    llen(key, cb) {
        return this._client.llen(key, cb);
    }
}

module.exports = Datastore;
