import { BucketsHandler, AccountsHandler, UsersHandler } from
    '../handlers/metricsHandlers';
import { validateBucketsListMetrics, validateAccountsListMetrics,
    validateUsersListMetrics } from '../validators/listMetrics';
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
        validator: validateAccountsListMetrics,
        handler: AccountsHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'accounts',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateUsersListMetrics,
        handler: UsersHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'users',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
];
