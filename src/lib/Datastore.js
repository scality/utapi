/* Provides methods for operations on a datastore */
export default class Datastore {
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
    * publish a message to a channel
    * @param {string} channel - channel to be published to
    * @param {string} message - message to be published
    * @return {undefined}
    */
    publish(channel, message) {
        return this._client.publish(channel, message);
    }
}
