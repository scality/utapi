import async from 'async';
import { errors } from 'arsenal';
import { genBucketKey } from './schema';
export default class Buckets {

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

    static getBucketMetrics(bucket, range, datastore, log, cb) {
        const start = range[0];
        const end = range[1] || Date.now();
        const keys = Buckets.getBucketKeys(bucket);
        datastore.bZrangebyscore(keys, start, end, (err, res) => {
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
            /**
            * Batch result is of the format
            * [ [null, ['1', '2', '3']], [null, ['4', '5', '6']] ] where each
            * item is the result of the each batch command
            * Foreach item in the resut, index 0 signifies the error and
            * index 1 contains the result
            */
            res.forEach((item, index) => {
                const key = keys[index];
                if (item[0]) {
                    // log error and continue
                    log.trace('command in a batch failed to execute', {
                        error: item[0],
                        method: 'Buckets.getBucketMetrics',
                        cmd: key,
                    });
                } else if (item[1].length > 0) {
                    // convert strings to numbers and sort them
                    // TODO: find a efficient way to avoid sorting
                    const m = Buckets.getMetricFromKey(key, bucket);
                    if (m === 'storageUtilized' || m === 'numberOfObjects') {
                        const values = item[1].map(v => {
                            const tmp = parseInt(v, 10);
                            return Number.isNaN(parseInt(v, 10)) ? 0 : tmp;
                        });

                        // pick min and max values
                        const min = values.shift();
                        // if max is n/a set min as max
                        let max = values.pop();
                        max = max === undefined ? min : max;
                        bucketRes[m][0] = min;
                        bucketRes[m][1] = max;
                    } else if (m === 'incomingBytes' || m === 'outgoingBytes') {
                        const values = item[1].map(v => {
                            const tmp = parseInt(v, 10);
                            return Number.isNaN(parseInt(v, 10)) ? 0 : tmp;
                        });

                        // pick min and max values
                        const min = values.shift();
                        // if max is n/a set min as max
                        const max = values.pop() || min;
                        bucketRes[m] = max;
                    } else {
                        // count is enough as it represents the delta of the
                        // metric between the two timestamps
                        bucketRes.operations[`s3:${m}`] = item[1].length || 0;
                    }
                }
            });
            return cb(null, bucketRes);
        });
    }

    static getMetricFromKey(key, bucket) {
        return key.replace(`s3:buckets:${bucket}:`, '');
    }

    static getBucketKeys(bucket) {
        return [
            genBucketKey(bucket, 'storageUtilized'),
            genBucketKey(bucket, 'incomingBytes'),
            genBucketKey(bucket, 'outgoingBytes'),
            genBucketKey(bucket, 'numberOfObjects'),
            genBucketKey(bucket, 'createBucket'),
            genBucketKey(bucket, 'deleteBucket'),
            genBucketKey(bucket, 'listBucket'),
            genBucketKey(bucket, 'getBucketAcl'),
            genBucketKey(bucket, 'putBucketAcl'),
            genBucketKey(bucket, 'listBucketMultipartUploads'),
            genBucketKey(bucket, 'listMultipartUploadParts'),
            genBucketKey(bucket, 'uploadPart'),
            genBucketKey(bucket, 'abortMultipartUpload'),
            genBucketKey(bucket, 'deleteObject'),
            genBucketKey(bucket, 'getObject'),
            genBucketKey(bucket, 'getObjectAcl'),
            genBucketKey(bucket, 'putObject'),
            genBucketKey(bucket, 'putObjectAcl'),
            genBucketKey(bucket, 'listAllMyBuckets'),
            genBucketKey(bucket, 'headBucket'),
            genBucketKey(bucket, 'headObject'),
            genBucketKey(bucket, 'initiateMultipartUpload'),
            genBucketKey(bucket, 'completeMultipartUpload'),
        ];
    }
}
