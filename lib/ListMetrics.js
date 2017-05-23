const async = require('async');
const { errors } = require('arsenal');
const { getMetricFromKey, getKeys, generateStateKey } = require('./schema');
const s3metricResponseJSON = require('../models/s3metricResponse');
const config = require('./Config');
const Vault = require('./Vault');

/**
* Provides methods to get metrics of different levels
*/
class ListMetrics {

    /**
     * Assign the metric property to an instance of this class
     * @param {string} metric - The metric type (e.g., 'buckets', 'accounts')
     * @param {string} component - The service component (e.g., 's3')
     */
    constructor(metric, component) {
        this.metric = metric;
        this.service = component;
        this.vault = new Vault(config);
    }

    /**
     * Create the metric object to retrieve data from schema methods
     * @param {string} resource - The resource to get metrics for
     * @return {object} obj - Object with a key-value pair for a schema method
     */
    _getSchemaObject(resource) {
        // Include service to generate key for any non-service level metric
        const obj = {
            level: this.metric,
            service: this.service,
        };
        const schemaKeys = {
            buckets: 'bucket',
            accounts: 'accountId',
            users: 'userId',
            service: 'service',
        };
        obj[schemaKeys[this.metric]] = resource;
        return obj;
    }

    // Create the metric response object for a given metric.
    _getMetricResponse(resource, start, end) {
        // Use `JSON.parse` to make deep clone because `Object.assign` will
        // copy property values.
        const metricResponse = JSON.parse(JSON.stringify(s3metricResponseJSON));
        metricResponse.timeRange = [start, end];
        const metricResponseKeys = {
            buckets: 'bucketName',
            accounts: 'accountId',
            users: 'userId',
            service: 'serviceName',
        };
        metricResponse[metricResponseKeys[this.metric]] = resource;
        return metricResponse;
    }

    /**
    * Callback for getting metrics for a list of resources
    * @callback ListMetrics~ListMetricsCb
    * @param {object} err - ArsenalError instance
    * @param {object[]} metric - list of objects containing metrics for each
    * resource provided in the request
    */

    /**
    * Get metrics for a list of metric resources
    * @param {utapiRequest} utapiRequest - utapiRequest instance
    * @param {ListMetrics~bucketsMetricsCb} cb - callback
    * @return {undefined}
    */
    getTypesMetrics(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        const validator = utapiRequest.getValidator();
        const resources = validator.get(this.metric);
        const timeRange = validator.get('timeRange');
        const datastore = utapiRequest.getDatastore();
        // map account ids to canonical ids
        if (this.metric === 'accounts') {
            return this.vault.getCanonicalIds(resources, log, (err, list) => {
                if (err) {
                    return cb(err);
                }
                return async.mapLimit(list.message.body, 5,
                    (item, next) => this.getMetrics(item.canonicalId, timeRange,
                        datastore, log, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            return next(null, Object.assign({}, res,
                            { accountId: item.accountId }));
                        }),
                        cb
                    );
            });
        }
        return async.mapLimit(resources, 5, (resource, next) =>
            this.getMetrics(resource, timeRange, datastore, log,
                next), cb
        );
    }

    /**
    * Get metrics starting from the second most recent normalized timestamp
    * range (e.g., if it is 6:31 when the request is made, then list metrics
    * starting from 6:15).
    * @param {utapiRequest} utapiRequest - utapiRequest instance
    * @param {ListMetrics~bucketsMetricsCb} cb - callback
    * @return {undefined}
    */
    getRecentTypesMetrics(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        const validator = utapiRequest.getValidator();
        const resources = validator.get(this.metric);
        const end = Date.now();
        const d = new Date(end);
        const minutes = d.getMinutes();
        const start = d.setMinutes((minutes - minutes % 15), 0, 0);
        const fifteenMinutes = 15 * 60 * 1000; // In milliseconds
        const timeRange = [start - fifteenMinutes, end];
        const datastore = utapiRequest.getDatastore();
        async.mapLimit(resources, 5, (resource, next) =>
            this.getMetrics(resource, timeRange, datastore, log,
                next), cb
        );
    }

    /**
    * Returns a list of timestamps incremented by 15 min. from start timestamp
    * to end timestamp
    * @param {number} start - start timestamp
    * @param {number} end - end timestamp
    * @return {number[]} range - array of timestamps
    */
    _getTimestampRange(start, end) {
        const res = [];
        let last = start;
        while (last < end) {
            res.push(last);
            const d = new Date(last);
            last = d.setMinutes(d.getMinutes() + 15);
        }
        res.push(end);
        return res;
    }

    /**
    * Callback for getting metrics for a single resource
    * @callback ListMetrics~getMetricsCb
    * @param {object} err - ArsenalError instance
    * @param {object} metricRes - metrics for a single resource
    * @param {string} [metricRes.bucketName] - (optional) name of the bucket
    * @param {string} [metricRes.accountId] - (optional) ID of the account
    * @param {number[]} metricRes.timeRange - start and end times as unix epoch
    * @param {number[]} metricRes.storageUtilized - storage utilized by the
    * bucket at start and end time. These are absolute values
    * @param {number} metricRes.incomingBytes - number of bytes received by the
    * bucket as object puts or mutlipart uploads
    * @param {number} metricRes.outgoingBytes - number of bytes transferred to
    * the clients from the objects belonging to the bucket
    * @param {number[]} metricRes.numberOfObjects - number of objects held by
    * the bucket at start and end times. These are absolute values.
    * @param {object} metricRes.operations - object containing S3 operations
    * and their counters, with the specific S3 operation as key and total count
    * of operations that happened between start time and end time as value
    */

    /**
    * Get metrics for a single resource
    * @param {string} resource - the metric resource
    * @param {number[]} range - time range with start time and end time as
    * its members in unix epoch timestamp format
    * @param {object} datastore - Datastore instance
    * @param {object} log - Werelogs logger instance
    * @param {ListMetrics~getMetricsCb} cb - callback
    * @return {undefined}
    */
    getMetrics(resource, range, datastore, log, cb) {
        const start = range[0];
        const end = range[1] || Date.now();
        const obj = this._getSchemaObject(resource);

        // find nearest neighbors for absolutes
        const storageUtilizedKey = generateStateKey(obj, 'storageUtilized');
        const numberOfObjectsKey = generateStateKey(obj, 'numberOfObjects');
        const storageUtilizedStart = ['zrevrangebyscore', storageUtilizedKey,
            start, '-inf', 'LIMIT', '0', '1'];
        const storageUtilizedEnd = ['zrevrangebyscore', storageUtilizedKey, end,
            '-inf', 'LIMIT', '0', '1'];
        const numberOfObjectsStart = ['zrevrangebyscore', numberOfObjectsKey,
            start, '-inf', 'LIMIT', '0', '1'];
        const numberOfObjectsEnd = ['zrevrangebyscore', numberOfObjectsKey, end,
            '-inf', 'LIMIT', '0', '1'];
        const timestampRange = this._getTimestampRange(start, end);
        const metricKeys = [].concat.apply([], timestampRange.map(
            i => getKeys(obj, i)));
        const cmds = metricKeys.map(item => ['get', item]);
        cmds.push(storageUtilizedStart, storageUtilizedEnd,
            numberOfObjectsStart, numberOfObjectsEnd);

        datastore.batch(cmds, (err, res) => {
            if (err) {
                log.trace('error occurred while getting metrics', {
                    error: err,
                    method: 'ListMetrics.getMetrics',
                    resource,
                });
                return cb(errors.InternalError);
            }
            const metricResponse = this._getMetricResponse(resource, start,
                end);
            // last 4 are results of storageUtilized, numberOfObjects,
            const absolutes = res.slice(-4);
            const deltas = res.slice(0, res.length - 4);
            absolutes.forEach((item, index) => {
                if (item[0]) {
                    // log error and continue
                    log.trace('command in a batch failed to execute', {
                        error: item[0],
                        method: 'ListMetrics.getMetrics',
                    });
                } else {
                    let val = parseInt(item[1], 10);
                    val = isNaN(val) ? 0 : val;
                    if (index === 0) {
                        metricResponse.storageUtilized[0] = val;
                    } else if (index === 1) {
                        metricResponse.storageUtilized[1] = val;
                    } else if (index === 2) {
                        metricResponse.numberOfObjects[0] = val;
                    } else if (index === 3) {
                        metricResponse.numberOfObjects[1] = val;
                    }
                }
            });

            /**
            * Batch result is of the format
            * [ [null, '1'], [null, '2'], [null, '3'] ] where each
            * item is the result of the each batch command
            * Foreach item in the resut, index 0 signifies the error and
            * index 1 contains the result
            */
            deltas.forEach((item, index) => {
                const key = metricKeys[index];
                if (item[0]) {
                    // log error and continue
                    log.trace('command in a batch failed to execute', {
                        error: item[0],
                        method: 'ListMetrics.getMetrics',
                        cmd: key,
                    });
                } else {
                    const m = getMetricFromKey(key);
                    let count = parseInt(item[1], 10);
                    count = Number.isNaN(count) ? 0 : count;
                    if (m === 'incomingBytes' || m === 'outgoingBytes') {
                        metricResponse[m] += count;
                    } else {
                        metricResponse.operations[`${this.service}:${m}`] +=
                            count;
                    }
                }
            });
            return cb(null, metricResponse);
        });
    }
}

module.exports = ListMetrics;
