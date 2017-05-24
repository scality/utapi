/**
 * This class is used to retain information about a route
 */
class Route {

    /**
     * Constructor
     *
     * @param {object} properties - Properties to create the route
     * @constructor
     */
    constructor(properties) {
        const data = properties || {};
        this._properties = {
            validator: data.validator || null,
            handler: data.handler || null,
            method: data.method || null,
            action: data.action || '',
            resource: data.resource,
            responseBuilder: data.responseBuilder || null,
            statusCode: data.statusCode || 0,
        };
    }

    /**
     * Returns the function to validate the request
     * @return {function} function to validate the request
     */
    getValidator() {
        return this._properties.validator;
    }

    /**
     * Returns the route's handler
     * @return {function} route handler function
     */
    getHandler() {
        return this._properties.handler;
    }

    /**
     * Returns the http method the route acts on
     * @return {string} route's http method
     */
    getMethod() {
        return this._properties.method;
    }

    /**
     * Returns the action to identify the route
     * @return {string} Action of the route
     */
    getAction() {
        return this._properties.action;
    }

    /**
     * Returns the function which bulids the client response
     * @return {function} response builder function
     */
    getResponseBuilder() {
        return this._properties.responseBuilder;
    }

    /**
     * Return HTTP status code to be used on route's success
     * @return {number} Http status code
     */
    getStatusCode() {
        return this._properties.statusCode;
    }

    /**
    * Return the resource the route should be acting on
    * @return {string} resource (service/bucket/account/user)
    */
    getResource() {
        return this._properties.resource;
    }
}

module.exports = Route;
