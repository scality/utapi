/**
 * Utapi request class
 *
 * @class
 */
export default class UtapiRequest {

    constructor() {
        this._log = null;
        this._validator = null;
        this._request = null;
        this._response = null;
        this._route = null;
        this._statusCode = 0;
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
     * @return {VaultRequest} Current instance
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
     * @return {VaultRequest} Current instance
     */
    setValidator(validator) {
        this._validator = validator;
        return this;
    }

    /**
     * Set http request object
     *
     * @param {object} req - Http request object
     * @return {VaultRequest} Current instance
     */
    setRequest(req) {
        this._request = req;
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
     * Set http response object
     *
     * @param {object} res - Http response object
     * @return {VaultRequest} Current instance
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
     * @return {VaultRequest} itself
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
     * @return {VaultRequest} itself
     */
    setStatusCode(code) {
        this._statusCode = code;
        return this;
    }

}
