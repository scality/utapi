import Buckets from '../lib/Buckets';
/**
@class BucketsHandler
* Handles Buckets resource actions
*/

export default class BucketsHandler {

    /**
    * List metrics for the given list of buckets
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'BucketsHandler.listMetrics',
        });
        return Buckets.getBucketsMetrics(utapiRequest, cb);
    }
}
