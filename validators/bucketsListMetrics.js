import Validator from './Validator';

/**
 * Function to create a validator for route POST /?Action=ListMetrics
 * @param {object} dict - Input fields for route
 * @return {Validator} Return the created validator
 */
export default function bucketListMetrics(dict) {
    return new Validator({
        timeRange: true,
        buckets: true,
    }, dict);
}
