const errors = require('../../../errors');
const { serviceToWarp10Label, operationToResponse } = require('../../../constants');
const { convertTimestamp, iterIfError } = require('../../../utils');
const { clients: warp10Clients } = require('../../../warp10');

const emptyOperationsResponse = Object.values(operationToResponse)
    .reduce((prev, key) => {
        prev[key] = 0;
        return prev;
    }, {});

const metricResponseKeys = {
    buckets: 'bucketName',
    accounts: 'accountId',
    users: 'userId',
    service: 'serviceName',
};

function positiveOrZero(value) {
    return Math.max(value, 0);
}

async function listMetric(ctx, params) {
    const labelName = serviceToWarp10Label[params.level];
    const resources = params.body[params.level];
    let [start, end] = params.body.timeRange;
    if (end === undefined) {
        end = Date.now();
    }

    let results;

    try {
        // A separate request will be made to warp 10 per requested resource
        results = await Promise.all(
            resources.map(async ({ resource, id }) => {
                const labels = { [labelName]: id };

                const res = await iterIfError(warp10Clients, warp10 => {
                    const options = {
                        params: {
                            start: convertTimestamp(start).toString(),
                            end: convertTimestamp(end).toString(),
                            labels,
                            node: warp10.nodeId,
                        },
                        macro: 'utapi/getMetrics',
                    };
                    return warp10.exec(options);
                }, error => ctx.logger.error('error during warp 10 request', {
                    error,
                    requestParams: {
                        start,
                        end,
                        labels,
                    },
                }));

                if (res.result.length === 0) {
                    ctx.logger.error('unable to retrieve metrics', { resource, type: params.level });
                    throw errors.InternalError;
                }

                const rawMetrics = JSON.parse(res.result[0]);

                // Due to various error cases it is possible for metrics in utapi to go negative.
                // As this is nonsensical to the user we replace any negative values with zero.
                const metrics = {
                    storageUtilized: rawMetrics.storageUtilized.map(positiveOrZero),
                    numberOfObjects: rawMetrics.numberOfObjects.map(positiveOrZero),
                    incomingBytes: positiveOrZero(rawMetrics.incomingBytes),
                    outgoingBytes: positiveOrZero(rawMetrics.outgoingBytes),
                    operations: rawMetrics.operations,
                };

                return {
                    resource,
                    metrics,
                };
            }),
        );
    } catch (error) {
        ctx.logger.error('error fetching metrics from warp10', { error });
        throw errors.InternalError;
    }


    // Convert the results from warp10 into the expected response format
    const resp = results
        .map(result => {
            const operations = Object.entries(result.metrics.operations)
                .reduce((prev, [key, value]) => {
                    prev[operationToResponse[key]] = value;
                    return prev;
                }, {});

            const metric = {
                ...result.metrics,
                timeRange: [start, end],
                operations: {
                    ...emptyOperationsResponse,
                    ...operations,
                },
            };
            metric[metricResponseKeys[params.level]] = result.resource;
            return metric;
        });

    ctx.results.body = resp;
    ctx.results.statusCode = 200;
}

module.exports = listMetric;
