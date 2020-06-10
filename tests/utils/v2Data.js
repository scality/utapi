const uuid = require('uuid');
const { UtapiMetric } = require('../../libV2/models');

function range(n, step) {
    const vals = [...Array(n).keys()];
    if (step) {
        return vals.map(i => i * step);
    }
    return vals;
}

function makeEvent(timestamp) {
    return new UtapiMetric({
        timestamp,
        uuid: uuid.v4(),
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
