
function getShardKey(prefix, shard) {
    return `${prefix}:shard:${shard}`
}

function getUtapiMetricKey(prefix, metric) {
    return `${prefix}:events:${metric.uuid}`;
}


module.exports = {
    getShardKey,
    getUtapiMetricKey,
};