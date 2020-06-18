const uuid = require('uuid');
const { UtapiMetric } = require('../../libV2/models');
const { operations } = require('../../libV2/constants');

function range(n, step) {
    const vals = [...Array(n).keys()];
    if (step) {
        return vals.map(i => i * step);
    }
    return vals;
}

function randInt(withNegative = true) {
    const x = Math.floor(Math.random() * 10000);
    return withNegative && Math.random() < 0.5 ? -x : x;
}

function maybe(func) {
    return Math.random() < 0.5 && func();
}

function randChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

const possibleFields = {
    bucket: uuid.v4,
    object: uuid.v4,
    versionId: uuid.v4,
    user: uuid.v4,
};

const requiredFields = {
    uuid: uuid.v4,
    operationId: () => randChoice(operations),
    account: uuid.v4,
    location: uuid.v4,
    objectDelta: randInt,
    sizeDelta: randInt,
    incomingBytes: () => randInt(false),
    outgoingBytes: () => randInt(false),
};


function makeEvent(timestamp) {
    const fields = Object.entries(requiredFields).reduce((fields, [key, func]) => {
        // eslint-disable-next-line no-param-reassign
        fields[key] = func();
        return fields;
    }, {});
    Object.entries(possibleFields).forEach(
        ([key, func]) => maybe(
            () => { fields[key] = func(); },
        ),
    );
    return new UtapiMetric({
        timestamp,
        ...fields,
    });
}

function generateFakeEvents(start, stop, count) {
    const duration = stop - start;
    const eventsEvery = duration / count;
    return range(count, eventsEvery).map(i => makeEvent(Math.floor(start + i)));
}

module.exports = {
    generateFakeEvents,
};
