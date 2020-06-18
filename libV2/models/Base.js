const Joi = require('@hapi/joi');

class BaseModel {
    constructor(data) {
        this._data = data || {};
    }

    _get(key, defaultValue) {
        const val = this._data[key];
        return val === undefined ? defaultValue : val;
    }

    _set(key, value) {
        this._data[key] = value;
        return this;
    }

    getValue() {
        return this._data;
    }
}

/*
    Builds a flexible data container with automatic field checking using `hapi/joi`.
    Getters and Setters are automatically created for fields so they can be accessed using `.` notation.

    @param name - Name for the model. Used as the internal js class name.
    @param schema - An object of joi schemas. Keys are used as field names and
                    the schemas are used to typecheck values.
    @returns - A subclass of BaseModel
*/
function buildModel(name, schema) {
    class Model extends BaseModel {
        constructor(data) {
            if (data !== undefined) {
                Object.entries(data).forEach(([key, value]) => {
                    if (schema[key]) {
                        Joi.attempt(value, schema[key]);
                    }
                });
            }
            super(data);
        }

        _set(key, value) {
            if (schema[key]) {
                Joi.attempt(value, schema[key]);
            }
            return super._set(key, value);
        }
    }
    Object.defineProperty(Model, 'name', { value: name });
    Object.keys(schema).forEach(key =>
        Object.defineProperty(Model.prototype, key, {
            // `function` is used rather than `=>` to work around context problem with `this`
            /* eslint-disable func-names, object-shorthand */
            get: function () {
                return this._get(key);
            },
            set: function (value) {
                this._set(key, value);
            },
            /* eslint-enable func-names, object-shorthand */
        }));
    return Model;
}

module.exports = {
    BaseModel,
    buildModel,
};
