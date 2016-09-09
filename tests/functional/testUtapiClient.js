import assert from 'assert';
import { mapSeries, series } from 'async';
import UtapiClient from '../../lib/UtapiClient';
import MemoryBackend from '../../lib/backend/Memory';
import Datastore from '../../lib/Datastore';
import { getBucketCounters, getMetricFromKey } from '../../lib/schema';
const testBucket = 'foo';
const memBackend = new MemoryBackend();
const datastore = new Datastore();
const utapiClient = new UtapiClient();
const reqUid = 'foo';
datastore.setClient(memBackend);
utapiClient.setDataStore(datastore);

function _assertCounters(bucket, cb) {
    const counters = getBucketCounters(testBucket);
    return mapSeries(counters, (item, next) =>
        memBackend.get(item, (err, res) => {
            if (err) {
                return next(err);
            }
            const metric = getMetricFromKey(item, bucket)
                .replace(':counter', '');
            if (item.indexOf('CreateBucket') !== -1) {
                assert.equal(res, 1, `${metric} must be 1`);
            } else {
                assert.equal(res, 0, `${metric} must be 0`);
            }
            return next();
        }), cb);
}

describe('Counters', () => {
    afterEach(() => memBackend.flushDb());

    it('should set counters (other than create bucket counter) to 0 on' +
        ' bucket creation', done => {
        utapiClient.pushMetricCreateBucket(reqUid, testBucket,
            () => _assertCounters(testBucket, done));
    });

    it('should reset counters on bucket re-creation', done => {
        series([
            next => utapiClient.pushMetricCreateBucket(reqUid, testBucket,
                next),
            next => utapiClient.pushMetricListBucket(reqUid, testBucket, next),
            next => utapiClient.pushMetricPutObject(reqUid, testBucket, 8, 0,
                next),
            next => utapiClient.pushMetricGetObject(reqUid, testBucket, 8,
                next),
            next => utapiClient.pushMetricDeleteObject(reqUid, testBucket, 8,
                next),
            next => utapiClient.pushMetricDeleteBucket(reqUid, testBucket,
                next),
            next => utapiClient.pushMetricCreateBucket(reqUid, testBucket,
                next),
        ], () => _assertCounters(testBucket, done));
    });
});
