const uuid = require('uuid/v4');

function serialize(value) {
    return `${value}:${uuid()}`
}

function deserialize(value) {
    return value.split(':')[0];
}

module.exports = { serialize, deserialize };