import assert from 'assert';
import { mapSeries, series } from 'async';
import UtapiClient from '../../src/lib/UtapiClient';
import Datastore from '../../src/lib/Datastore';
import redisClient from '../../src/utils/redisClient';
import { Logger } from 'werelogs';
import { getCounters } from '../../src/lib/schema';
const datastore = new Datastore();
const utapiClient = new UtapiClient();
const reqUid = 'foo';
const redis = redisClient({ host: '127.0.0.1', port: 6379 }, Logger);
const metricTypes = {
    bucket: 'foo-bucket',
    accountId: 'foo-account',
};

// Get the metric object for the given type
function _getMetricObj(type) {
    const levels = {
        bucket: 'buckets',
        accountId: 'accounts',
    };
    const obj = { level: levels[type] };
    obj[type] = metricTypes[type];
    return obj;
}

// Get the metric from the key that is passed
function _getMetricFromKey(key, value, metricObj) {
    let metric;
    if ('bucket' in metricObj) {
        metric = key.slice(22);
    } else if ('accountId' in metricObj) {
        metric = key.slice(24);
    }
    return metric.replace(`${value}:`).replace(':counter', '');
}

datastore.setClient(redis);
utapiClient.setDataStore(datastore);
function _assertCounters(metricName, metricObj, cb) {
    const counters = getCounters(metricObj);
    return mapSeries(counters, (item, next) =>
        datastore.get(item, (err, res) => {
            if (err) {
                return next(err);
            }
            const metric = _getMetricFromKey(item, metricName, metricObj);
            assert.equal(res, 0, `${metric} must be 0`);
            return next();
        }), cb);
}

Object.keys(metricTypes).forEach(type => {
    if (metricTypes[type] === undefined) {
        return;
    }
    const metricObj = _getMetricObj(type);
    describe(`Counters with ${type} metrics`, () => {
        afterEach(() => redis.flushdb());

        it('should set counters to 0 on bucket creation', done => {
            utapiClient.pushMetric('createBucket', reqUid, metricObj, () =>
                _assertCounters(metricTypes[type], metricObj, done));
        });

        it('should reset counters on bucket re-creation', done => {
            series([
                next => utapiClient.pushMetric('createBucket', reqUid,
                    metricObj, next),
                next => utapiClient.pushMetric('listBucket', reqUid, metricObj,
                    next),
                next => utapiClient.pushMetric('putObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 8,
                        oldByteLength: 0,
                    }), next),
                next => utapiClient.pushMetric('getObject', reqUid,
                    Object.assign(metricObj, {
                        newByteLength: 8,
                    }), next),
                next => utapiClient.pushMetric('deleteObject', reqUid,
                    Object.assign(metricObj, {
                        byteLength: 8,
                        numberOfObjects: 1,
                    }), next),
                next => utapiClient.pushMetric('deleteBucket', reqUid,
                    metricObj, next),
                next => utapiClient.pushMetric('createBucket', reqUid,
                    metricObj, next),
            ], () => _assertCounters(metricTypes[type], metricObj, done));
        });
    });
});
