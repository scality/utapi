const log = require('./log');
const shard = require('./shard');
const timestamp = require('./timestamp');
const func = require('./func');
const disk = require('./disk');
const stream = require('./stream');

module.exports = {
    ...log,
    ...shard,
    ...timestamp,
    ...func,
    ...disk,
    ...stream,
};
