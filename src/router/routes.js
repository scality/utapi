import BucketsHandler from '../handlers/BucketsHandler';
import validateBucketsListMetrics from '../validators/bucketsListMetrics';
import bucketsListMetricsResponse from '../responses/bucketsListMetrics';

export default [
    {
        validator: validateBucketsListMetrics,
        handler: BucketsHandler.listMetrics,
        method: 'POST',
        action: 'ListMetrics',
        resource: 'buckets',
        responseBuilder: bucketsListMetricsResponse,
        statusCode: 200,
    },
];
