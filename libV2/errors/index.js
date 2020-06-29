/* eslint-disable no-param-reassign */
const utapiErrors = require('./errors.json');

class UtapiError extends Error {
    constructor(type, code, desc) {
        super(type);
        this.code = code;
        this.description = desc;
        this[type] = true;
        this.utapiError = true;
    }

    customizeDescription(description) {
        return new UtapiError(this.message, this.code, description);
    }
}

function errorsGen() {
    return Object.keys(utapiErrors)
        .reduce((errors, name) => {
            errors[name] = new UtapiError(name, utapiErrors[name].code,
                utapiErrors[name].description);
            return errors;
        }, {});
}

module.exports = errorsGen();
