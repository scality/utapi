const log = require('./log');
const shard = require('./shard');
const timestamp = require('./timestamp');
const func = require('./func');

module.exports = {
    ...log,
    ...shard,
    ...timestamp,
    ...func,
};
