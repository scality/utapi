import { BucketsHandler, AccountsHandler } from '../handlers/metricsHandlers';
import { validateBucketsListMetrics,
    validateAccountsListMetrics,
    validateBucketsListRecentMetrics,
    validateAccountsListRecentMetrics } from '../validators/listMetrics';
import listMetricsResponse from '../responses/listMetrics';

export default [
    {
        validator: validateBucketsListMetrics,
        handler: BucketsHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'buckets',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateBucketsListRecentMetrics,
        handler: BucketsHandler.listRecentMetrics,
        method: 'POST',
        action: 'ListRecentMetrics',
        resource: 'buckets',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateAccountsListMetrics,
        handler: AccountsHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'accounts',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateAccountsListRecentMetrics,
        handler: AccountsHandler.listRecentMetrics,
        method: 'POST',
        action: 'ListRecentMetrics',
        resource: 'accounts',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
];
