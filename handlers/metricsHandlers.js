const ListMetrics = require('../lib/ListMetrics');

function listRecentMetrics(utapiRequest, metric, service, cb) {
    const log = utapiRequest.getLog();
    log.debug('handling list recent metrics request', {
        method: 'listRecentMetrics',
    });
    const Metric = new ListMetrics(metric, service);
    return Metric.getRecentTypesMetrics(utapiRequest, cb);
}

/**
 * @class BucketsHandler
 * Handles Buckets resource actions
 */

class BucketsHandler {
    /**
    * List metrics for the given list of buckets
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, service, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'BucketsHandler.listMetrics',
        });
        const Buckets = new ListMetrics('buckets', service);
        return Buckets.getTypesMetrics(utapiRequest, cb);
    }

    /**
    * List metrics starting from the second most recent fifteen minute timestamp
    * for the given list of buckets
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listRecentMetrics(utapiRequest, service, cb) {
        return listRecentMetrics(utapiRequest, 'buckets', service, cb);
    }
}

/**
 * @class AccountsHandler
 * Handles Accounts resource actions
 */

class AccountsHandler {
    /**
    * List metrics for the given list of accounts
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, service, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'AccountsHandler.listMetrics',
        });
        const Accounts = new ListMetrics('accounts', service);
        return Accounts.getTypesMetrics(utapiRequest, cb);
    }

    /**
    * List metrics starting from the second most recent fifteen minute timestamp
    * for the given list of accounts
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listRecentMetrics(utapiRequest, service, cb) {
        return listRecentMetrics(utapiRequest, 'accounts', service, cb);
    }
}

/**
 * @class ServiceHandler
 * Handles Services resource actions
 */

class ServiceHandler {
    /**
    * List metrics for the given list of services
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, service, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'ServiceHandler.listMetrics',
        });
        const Service = new ListMetrics('service', service);
        return Service.getTypesMetrics(utapiRequest, cb);
    }

    /**
    * List metrics starting from the second most recent fifteen minute timestamp
    * for the given list of services
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listRecentMetrics(utapiRequest, service, cb) {
        return listRecentMetrics(utapiRequest, 'service', service, cb);
    }
}

/**
 * @class UsersHandler
 * Handles Users resource actions
 */

class UsersHandler {
    /**
    * List metrics for the given list of users
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listMetrics(utapiRequest, service, cb) {
        const log = utapiRequest.getLog();
        log.debug('handling list metrics request', {
            method: 'UsersHandler.listMetrics',
        });
        const Users = new ListMetrics('users', service);
        return Users.getTypesMetrics(utapiRequest, cb);
    }

    /**
    * List metrics starting from the second most recent fifteen minute timestamp
    * for the given list of users
    * @param {UtapiRequest} utapiRequest - UtapiRequest instance
    * @param {string} service - the service component (e.g., 's3')
    * @param {callback} cb - callback
    * @return {undefined}
    */
    static listRecentMetrics(utapiRequest, service, cb) {
        return listRecentMetrics(utapiRequest, 'users', service, cb);
    }
}

module.exports = {
    BucketsHandler,
    AccountsHandler,
    ServiceHandler,
    UsersHandler,
};
