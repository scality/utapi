import { BucketsHandler, AccountsHandler, UsersHandler, ServiceHandler } from
    '../handlers/metricsHandlers';
import { validateBucketsListMetrics, validateAccountsListMetrics,
    validateUsersListMetrics, validateServiceListMetrics,
    validateBucketsListRecentMetrics, validateAccountsListRecentMetrics,
    validateUsersListRecentMetrics, validateServiceListRecentMetrics } from
    '../validators/listMetrics';
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
    {
        validator: validateUsersListMetrics,
        handler: UsersHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'users',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateUsersListRecentMetrics,
        handler: UsersHandler.listRecentMetrics,
        method: 'POST',
        action: 'ListRecentMetrics',
        resource: 'users',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateServiceListMetrics,
        handler: ServiceHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'service',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
    {
        validator: validateServiceListRecentMetrics,
        handler: ServiceHandler.listRecentMetrics,
        method: 'POST',
        action: 'ListRecentMetrics',
        resource: 'service',
        responseBuilder: listMetricsResponse,
        statusCode: 200,
    },
];
