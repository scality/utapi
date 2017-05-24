/**
* @typedef {object} Response
* @property {Error} error - JSON.parse exception
* @property {object} result - parsed JSON
*/

/**
* parse JSON without throwing an exception
* @param {string} jsonStr - stringified json
* @return {Response} - response object
*/
function safeJsonParse(jsonStr) {
    let result = null;
    try {
        result = JSON.parse(jsonStr);
    } catch (e) {
        return { error: e, result };
    }
    return { error: null, result };
}

module.exports = safeJsonParse;
