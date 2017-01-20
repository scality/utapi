import ListMetrics from '../lib/ListMetrics';

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
}

/**
 * @class UsersHandler
 * Handles Users resource actions
 */

export class UsersHandler {
    /**
    * List metrics for the given list of users
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'UsersHandler.listMetrics',
        });
        const Users = new ListMetrics('users');
        return Users.getTypesMetrics(utapiRequest, cb);
    }
}
