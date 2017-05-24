/**
 * Utapi request class
 *
 * @class
 */
class UtapiRequest {

    constructor() {
        this._log = null;
        this._validator = null;
        this._request = null;
        this._response = null;
        this._route = null;
        this._statusCode = 0;
        this._datastore = null;
        this._requestQuery = null;
        this._requestPath = null;
    }

    /**
     * Function to get the logger
     *
     * @return {object} Logger object
     */
    getLog() {
        return this._log;
    }

    /**
     * Function to set the logger
     *
     * @param {object} log - Logger
     * @return {UtapiRequest} itself
     */
    setLog(log) {
        this._log = log;
        return this;
    }

    /**
     * Function to get the validator
     *
     * @return {Validator} Validator object
     */
    getValidator() {
        return this._validator;
    }

    /**
     * Function to set the validator
     *
     * @param {Validator} validator - Validator
     * @return {UtapiRequest} itself
     */
    setValidator(validator) {
        this._validator = validator;
        return this;
    }

    /**
     * Set http request object
     *
     * @param {object} req - Http request object
     * @return {UtapiRequest} itself
     */
    setRequest(req) {
        this._request = req;
        return this;
    }

    /**
     * Set request query
     *
     * @param {object} query - query from request
     * @return {UtapiRequest} itself
     */
    setRequestQuery(query) {
        const decodedQuery = {};
        Object.keys(query).forEach(x => {
            const key = decodeURIComponent(x);
            const value = decodeURIComponent(query[x]);
            decodedQuery[key] = value;
        });
        this._requestQuery = decodedQuery;
        return this;
    }

    /**
     * Set request path
     *
     * @param {string} path - path from url.parse
     * of request.url (pathname plus query)
     * @return {UtapiRequest} itself
     */
    setRequestPath(path) {
        this._requestPath = decodeURIComponent(path);
        return this;
    }

    /**
     * Set request pathname
     *
     * @param {string} pathname - pathname from url.parse
     * of request.url (pathname minus query)
     * @return {UtapiRequest} itself
     */
    setRequestPathname(pathname) {
        this._requestPathname = pathname;
        return this;
    }

    /**
     * Get http request object
     *
     * @return {object} Http request object
     */
    getRequest() {
        return this._request;
    }

    /**
     * Get http headers object
     *
     * @return {object} headers request headers
     */
    getRequestHeaders() {
        return this._request.headers;
    }

    /**
     * Get http query object
     *
     * @return {object} request query
     */
    getRequestQuery() {
        return this._requestQuery;
    }

    /**
     * Get request path
     *
     * @return {string} request path
     */
    getRequestPath() {
        return this._requestPath;
    }

    /**
     * Get request pathname
     *
     * @return {string} request pathname
     */
    getRequestPathname() {
        return this._requestPathname;
    }

    /**
     * Get requester ip address
     *
     * @return {string} requesterIp requester Ip address
     */
    getRequesterIp() {
        return this._request.socket.remoteAddress;
    }

    /**
     * Get ssl enabled
     *
     * @return {boolean} sslEnabled whether sslEnabled request
     */
    getSslEnabled() {
        return this._request.connection.encrypted;
    }

    /**
     * Get action
     *
     * @return {string} action
     */
    getAction() {
        return this._route.getAction();
    }

    /**
     * Get resource
     *
     * @return {string} resource
     */
    getResource() {
        return this._route.getResource();
    }

    /**
     * Set http response object
     *
     * @param {object} res - Http response object
     * @return {UtapiRequest} itself
     */
    setResponse(res) {
        this._response = res;
        return this;
    }

    /**
     * Get http response object
     *
     * @return {object} Http response object
     */
    getResponse() {
        return this._response;
    }

    /**
     * Get the current route
     *
     * @return {Route} current route
     */
    getRoute() {
        return this._route;
    }

    /**
     * Set the current route
     *
     * @param {Route} route - Current route
     * @return {UtapiRequest} itself
     */
    setRoute(route) {
        this._route = route;
        return this;
    }

    /**
     * Get the status code of the request
     *
     * @return {number} Http status code of the request
     */
    getStatusCode() {
        return this._statusCode;
    }

    /**
     * Set the status code of the request
     *
     * @param {number} code - Http status code of the request
     * @return {UtapiRequest} itself
     */
    setStatusCode(code) {
        this._statusCode = code;
        return this;
    }

    /**
     * Set the datastore to be used as backend
     * @param {Datastore} ds - Datastore instance
     * @return {UtapiRequest} itself
     */
    setDatastore(ds) {
        this._datastore = ds;
        return this;
    }

    /**
     * Get the datastore to be used as backend
     * @return {Datastore} Datastore instance
     */
    getDatastore() {
        return this._datastore;
    }

}

module.exports = UtapiRequest;
