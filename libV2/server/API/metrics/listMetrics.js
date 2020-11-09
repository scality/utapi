const errors = require('../../../errors');
const { serviceToWarp10Label, operationToResponse } = require('../../../constants');
const { convertTimestamp } = require('../../../utils');
const { client: warp10 } = require('../../../warp10');
const config = require('../../../config');

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

async function listMetric(ctx, params) {
    const labelName = serviceToWarp10Label[params.level];
    const resources = params.body[params.level];
    const [start, end] = params.body.timeRange
        .map(convertTimestamp)
        .map(v => v.toString());

    // A separate request will be made to warp 10 per requested resource
    const results = await Promise.all(
        resources.map(async ({ resource, id }) => {
            const labels = { [labelName]: id };
            const options = {
                params: {
                    start,
                    end,
                    labels,
                    node: config.nodeId,
                },
                macro: 'utapi/getMetrics',
            };
            const res = await warp10.exec(options);
            if (res.result.length === 0) {
                ctx.logger.error('unable to retrieve metrics', { resource, type: params.level });
                throw errors.InternalError;
            }
            return {
                resource,
                metrics: JSON.parse(res.result[0]),
            };
        }),
    );

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
                timeRange: params.body.timeRange,
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
