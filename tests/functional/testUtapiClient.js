import assert from 'assert';
import { mapSeries, series } from 'async';
import UtapiClient from '../../src/lib/UtapiClient';
import Datastore from '../../src/lib/Datastore';
import redisClient from '../../src/utils/redisClient';
import { Logger } from 'werelogs';
import { getBucketCounters, getMetricFromKey } from '../../src/lib/schema';
const bucket = 'foo';
const datastore = new Datastore();
const utapiClient = new UtapiClient();
const reqUid = 'foo';
const redis = redisClient({ host: '127.0.0.1', port: 6379 }, Logger);
datastore.setClient(redis);
utapiClient.setDataStore(datastore);
function _assertCounters(bucket, cb) {
    const counters = getBucketCounters(bucket);
    return mapSeries(counters, (item, next) =>
        datastore.get(item, (err, res) => {
            if (err) {
                return next(err);
            }
            const metric = getMetricFromKey(item, bucket)
                .replace(':counter', '');
            assert.equal(res, 0, `${metric} must be 0`);
            return next();
        }), cb);
}

describe('Counters', () => {
    afterEach(() => redis.flushdb());

    it('should set counters to 0 on bucket creation', done => {
        utapiClient.pushMetric('createBucket', reqUid, { bucket },
            () => _assertCounters(bucket, done));
    });

    it('should reset counters on bucket re-creation', done => {
        series([
            next => utapiClient.pushMetric('createBucket', reqUid, { bucket },
                next),
            next => utapiClient.pushMetric('listBucket', reqUid, { bucket },
                next),
            next => utapiClient.pushMetric('putObject', reqUid, {
                bucket,
                newByteLength: 8,
                oldByteLength: 0,
            }, next),
            next => utapiClient.pushMetric('getObject', reqUid, {
                bucket,
                newByteLength: 8,
            }, next),
            next => utapiClient.pushMetric('deleteObject', reqUid, {
                bucket,
                byteLength: 8,
                numberOfObjects: 1,
            }, next),
            next => utapiClient.pushMetric('deleteBucket', reqUid, { bucket },
                next),
            next => utapiClient.pushMetric('createBucket', reqUid, { bucket },
                next),
        ], () => _assertCounters(bucket, done));
    });
});
