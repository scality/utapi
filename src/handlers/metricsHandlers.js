import ListMetrics from '../lib/ListMetrics';

function listRecentMetrics(utapiRequest, metric, cb) {
    const log = utapiRequest.getLog();
    log.debug('handling list recent metrics request', {
        method: 'listRecentMetrics',
    });
    const Metric = new ListMetrics(metric);
    return Metric.getRecentTypesMetrics(utapiRequest, cb);
}

/**
 * @class BucketsHandler
 * Handles Buckets resource actions
 */

export class BucketsHandler {
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
        const Buckets = new ListMetrics('buckets');
        return Buckets.getTypesMetrics(utapiRequest, cb);
    }

    /**
    * List metrics for the most recent 15 minutes of a given list of buckets
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listRecentMetrics(utapiRequest, cb) {
        return listRecentMetrics(utapiRequest, 'buckets', cb);
    }
}

/**
 * @class AccountsHandler
 * Handles Accounts resource actions
 */

export class AccountsHandler {
    /**
    * List metrics for the given list of accounts
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'AccountsHandler.listMetrics',
        });
        const Accounts = new ListMetrics('accounts');
        return Accounts.getTypesMetrics(utapiRequest, cb);
    }

    /**
    * List metrics for the most recent 15 minutes of a given list of accounts
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listRecentMetrics(utapiRequest, cb) {
        return listRecentMetrics(utapiRequest, 'accounts', cb);
    }
}
