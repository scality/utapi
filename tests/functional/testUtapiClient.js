import assert from 'assert';
import { mapSeries, series } from 'async';
import UtapiClient from '../../lib/UtapiClient';
import MemoryBackend from '../../lib/backend/Memory';
import Datastore from '../../lib/Datastore';
import { getBucketGlobalCounters, getMetricFromKey } from '../../lib/schema';
const testBucket = 'foo';
const memBackend = new MemoryBackend();
const datastore = new Datastore();
const utapiClient = new UtapiClient();
datastore.setClient(memBackend);
utapiClient.setDataStore(datastore);

function _assertCounters(bucket, cb) {
    const gCounters = getBucketGlobalCounters(testBucket);
    return mapSeries(gCounters, (item, next) =>
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

    it('should set global counters (other than create bucket counter) to 0 on' +
        ' bucket creation', done => {
        const now = Date.now();
        utapiClient.pushMetricCreateBucket(testBucket, now,
            () => _assertCounters(testBucket, done));
    });

    it('should reset global counters on bucket re-creation', done => {
        series([
            next => utapiClient.pushMetricCreateBucket(testBucket, Date.now(),
                next),
            next => utapiClient.pushMetricListBucket(testBucket, Date.now(),
                next),
            next => utapiClient.pushMetricPutObject(testBucket, Date.now(), 8,
                0, next),
            next => utapiClient.pushMetricGetObject(testBucket, Date.now(), 8,
                next),
            next => utapiClient.pushMetricDeleteObject(testBucket, Date.now(),
                8, next),
            next => utapiClient.pushMetricDeleteBucket(testBucket, Date.now(),
                next),
            next => utapiClient.pushMetricCreateBucket(testBucket, Date.now(),
                next),
        ], () => _assertCounters(testBucket, done));
    });
});
