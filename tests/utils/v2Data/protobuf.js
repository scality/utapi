const protobuf = require('protobufjs');
const jsonDescriptors = require('./proto-descriptors.json');

const root = protobuf.Root.fromJSON(jsonDescriptors);

function decode(type, data) {
    const Type = root.lookup(type);
    if (!Type) {
        throw new Error(`Unknown type ${type}`);
    }
    const msg = Type.decode(Buffer.from(data, 'hex'));
    return Object.entries(msg)
        .reduce((prev, [key, value]) => {
            if (value instanceof protobuf.util.Long) {
                prev[key] = value.toNumber();
            } else {
                prev[key] = value;
            }
            return prev;
        }, {});
}

module.exports = {
    decode,
};
