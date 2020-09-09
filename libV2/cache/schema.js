function getShardKey(prefix, shard) {
    return `${prefix}:shard:${shard}`;
}

function getUtapiMetricKey(prefix, metric) {
    return `${prefix}:events:${metric.uuid}`;
}

function getShardMasterKey(prefix) {
    return `${prefix}:shard:master`;
}

function getAccountSizeCounterKey(prefix, account) {
    return `${prefix}:counters:account:${account}:size`;
}

function getAccountSizeCounterBaseKey(prefix, account) {
    return `${prefix}:counters:account:${account}:size:base`;
}

module.exports = {
    getShardKey,
    getUtapiMetricKey,
    getShardMasterKey,
    getAccountSizeCounterKey,
    getAccountSizeCounterBaseKey,
};
