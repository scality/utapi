function getShardKey(prefix, shard) {
    return `${prefix}:shard:${shard}`;
}

function getUtapiMetricKey(prefix, metric) {
    return `${prefix}:events:${metric.uuid}`;
}

function getShardMasterKey(prefix) {
    return `${prefix}:shard:master`;
}

module.exports = {
    getShardKey,
    getUtapiMetricKey,
    getShardMasterKey,
};
