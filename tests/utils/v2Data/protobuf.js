const protobuf = require('protobufjs');
const jsonDescriptors = require('./proto-descriptors.json');

const root = protobuf.Root.fromJSON(jsonDescriptors);

function decode(type, data, includeDefaults = true) {
    const Type = root.lookup(type);
    if (!Type) {
        throw new Error(`Unknown type ${type}`);
    }
    const msg = Type.decode(Buffer.from(data, 'hex'));
    return Type.toObject(msg, {
        longs: Number,
        defaults: includeDefaults,
        objects: true,
    });
}

module.exports = {
    decode,
};
