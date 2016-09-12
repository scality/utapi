import async from 'async';
import { errors } from 'arsenal';
import { getMetricFromKey, getBucketKeys, genBucketStateKey } from './schema';
import getTimespan from '../utils/getTimespan';

/**
* Provides static methods to get bucket level metrics
*/
export default class Buckets {

    /**
    * Callback for getting metrics for a list of buckets
    * @callback Buckets~bucketsMetricsCb
    * @param {object} err - ArsenalError instance
    * @param {object[]} buckets - list of objects containing metrics for each
    * bucket provided in the request
    */

    /**
    * Get metrics for a list of buckets
    * @param {utapiRequest} utapiRequest - utapiRequest instance
    * @param {Buckets~bucketsMetricsCb} cb - callback
    * @return {undefined}
    */
    static getBucketsMetrics(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        const validator = utapiRequest.getValidator();
        const buckets = validator.get('buckets');
        const timeRange = validator.get('timeRange');
        const datastore = utapiRequest.getDatastore();
        async.mapLimit(buckets, 5, (bucket, next) =>
            Buckets.getBucketMetrics(bucket, timeRange, datastore, log, next),
            cb
        );
    }

    /**
    * Returns a list of timestamps incremented by a day starting from start
    * to end
    * @param {number} start - start timestamp
    * @param {number} end - end timestamp
    * @return {number[]} range - array of timestamps
    */
    static getTimespanRange(start, end) {
        const res = [];
        let last = start;
        while (last !== end) {
            res.push(last);
            const d = new Date(last);
            last = d.setDate(d.getDate() + 1);
        }
        res.push(end);
        return res;
    }

    /**
    * Callback for getting metrics for a single bucket
    * @callback Buckets~getBucketMetricsCb
    * @param {object} err - ArsenalError instance
    * @param {object} bucket - metrics for a single bucket
    * @param {string} bucket.bucketName - name of the bucket
    * @param {number[]} bucket.timeRange - start and end times as unix epoch
    * @param {number[]} bucket.storageUtilized - storage utilized by the
    * bucket at start and end time. These are absolute values
    * @param {number} bucket.incomingBytes - number of bytes received by the
    * bucket as object puts or mutlipart uploads
    * @param {number} bucket.outgoingBytes - number of bytes transferred to
    * the clients from the objects belonging to the bucket
    * @param {number[]} bucket.numberOfObjects - number of objects held by
    * the bucket at start and end times. These are absolute values.
    * @param {object} bucket.operations - object containing s3 operations
    * and their counters, with the specific S3 operation as key and total count
    * of operations that happened between start time and end time as value
    */

    /**
    * Get metrics for a single bucket
    * @param {string} bucket - bucket name
    * @param {number[]} range - time range with start time and end time as
    * it's members in unix epoch timestamp format
    * @param {object} datastore - Datastore instance
    * @param {object} log - Werelogs logger instance
    * @param {Buckets~getBucketMetricsCb} cb - callback
    * @return {undefined}
    */
    static getBucketMetrics(bucket, range, datastore, log, cb) {
        const start = range[0];
        const startspan = getTimespan(start);
        const end = range[1] || Date.now();
        const endspan = getTimespan(end);
        const storageUtilizedKey = genBucketStateKey(bucket, 'storageUtilized');
        const numberOfObjectsKey = genBucketStateKey(bucket, 'numberOfObjects');
        const incomingBytesKey = genBucketStateKey(bucket, 'incomingBytes');
        const outgoingBytesKey = genBucketStateKey(bucket, 'outgoingBytes');
        const storageUtilizedStart = ['zrevrangebyscore', storageUtilizedKey,
            start, '-inf', 'LIMIT', '0', '1'];
        const storageUtilizedEnd = ['zrevrangebyscore', storageUtilizedKey, end,
            '-inf', 'LIMIT', '0', '1'];
        const numberOfObjectsStart = ['zrevrangebyscore', numberOfObjectsKey,
            start, '-inf', 'LIMIT', '0', '1'];
        const numberOfObjectsEnd = ['zrevrangebyscore', numberOfObjectsKey, end,
            '-inf', 'LIMIT', '0', '1'];
        const incomingBytesStart = ['zrevrangebyscore', incomingBytesKey,
            start, '-inf', 'LIMIT', '0', '1'];
        const incomingBytesEnd = ['zrevrangebyscore', incomingBytesKey, end,
            '-inf', 'LIMIT', '0', '1'];
        const outgoingBytesStart = ['zrevrangebyscore', outgoingBytesKey, start,
            '-inf', 'LIMIT', '0', '1'];
        const outgoingBytesEnd = ['zrevrangebyscore', outgoingBytesKey, end,
            '-inf', 'LIMIT', '0', '1'];
        const timespanRange = Buckets.getTimespanRange(startspan, endspan);
        const bucketKeys = [].concat.apply([],
            timespanRange.map(i => getBucketKeys(bucket, i)));
        const cmds = bucketKeys.map(item => ['zrangebyscore', item, start,
            end]);
        cmds.push(storageUtilizedStart, storageUtilizedEnd,
            numberOfObjectsStart, numberOfObjectsEnd, incomingBytesStart,
            incomingBytesEnd, outgoingBytesStart, outgoingBytesEnd);

        datastore.batch(cmds, (err, res) => {
            if (err) {
                log.trace('error occurred while getting bucket metrics', {
                    error: err,
                    method: 'Buckets.getBucketMetrics',
                    bucket,
                });
                return cb(errors.InternalError);
            }
            const bucketRes = {
                bucketName: bucket,
                timeRange: [start, end],
                storageUtilized: [0, 0],
                incomingBytes: 0,
                outgoingBytes: 0,
                numberOfObjects: [0, 0],
                operations: {
                    's3:DeleteBucket': 0,
                    's3:ListBucket': 0,
                    's3:GetBucketAcl': 0,
                    's3:CreateBucket': 0,
                    's3:PutBucketAcl': 0,
                    's3:PutObject': 0,
                    's3:UploadPart': 0,
                    's3:ListBucketMultipartUploads': 0,
                    's3:ListMultipartUploadParts': 0,
                    's3:InitiateMultipartUpload': 0,
                    's3:CompleteMultipartUpload': 0,
                    's3:AbortMultipartUpload': 0,
                    's3:DeleteObject': 0,
                    's3:GetObject': 0,
                    's3:GetObjectAcl': 0,
                    's3:PutObjectAcl': 0,
                    's3:ListAllMyBuckets': 0,
                    's3:HeadBucket': 0,
                    's3:HeadObject': 0,
                },
            };

            // last 8 are results of storageUtilized, numberOfObjects,
            // incomingBytes and outgoingBytes
            const absolutes = res.splice(-8);
            const incomingBytes = [0, 0];
            const outgoingBytes = [0, 0];
            absolutes.forEach((item, index) => {
                if (item[0]) {
                    // log error and continue
                    log.trace('command in a batch failed to execute', {
                        error: item[0],
                        method: 'Buckets.getBucketMetrics',
                    });
                } else {
                    let val = parseInt(item[1], 10);
                    val = isNaN(val) ? 0 : val;
                    if (index === 0) {
                        bucketRes.storageUtilized[0] = val;
                    } else if (index === 1) {
                        bucketRes.storageUtilized[1] = val;
                    } else if (index === 2) {
                        bucketRes.numberOfObjects[0] = val;
                    } else if (index === 3) {
                        bucketRes.numberOfObjects[1] = val;
                    } else if (index === 4) {
                        incomingBytes[0] = val;
                    } else if (index === 5) {
                        incomingBytes[1] = val;
                    } else if (index === 6) {
                        outgoingBytes[0] = val;
                    } else if (index === 7) {
                        outgoingBytes[1] = val;
                    }
                }
            });
            // calculate the delta values for incoming and outgoing bytes
            bucketRes.incomingBytes = Math.abs(
                incomingBytes[1] - incomingBytes[0]);
            bucketRes.outgoingBytes = Math.abs(
                outgoingBytes[1] - outgoingBytes[0]);

            /**
            * Batch result is of the format
            * [ [null, ['1', '2', '3']], [null, ['4', '5', '6']] ] where each
            * item is the result of the each batch command
            * Foreach item in the resut, index 0 signifies the error and
            * index 1 contains the result
            */
            res.forEach((item, index) => {
                const key = bucketKeys[index];
                if (item[0]) {
                    // log error and continue
                    log.trace('command in a batch failed to execute', {
                        error: item[0],
                        method: 'Buckets.getBucketMetrics',
                        cmd: key,
                    });
                } else if (Array.isArray(item[1])) {
                    // convert strings to numbers for comparision
                    const m = getMetricFromKey(key, bucket);
                    // count is enough as it represents the delta of the
                    // metric between the two timestamps
                    bucketRes.operations[`s3:${m}`] += item[1].length || 0;
                }
            });
            return cb(null, bucketRes);
        });
    }
}
