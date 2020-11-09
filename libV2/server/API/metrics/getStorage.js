const errors = require('../../../errors');
const { serviceToWarp10Label } = require('../../../constants');
const { client: warp10 } = require('../../../warp10');
const { client: cache } = require('../../../cache');
const { now } = require('../../../utils');
const config = require('../../../config');

/**
 *
 * @param {RequestContext} ctx - request context
 * @param {object} params - request parameters
 * @param {string} params.level - metric level
 * @param {string} params.resource - Id of the requested resource
 * @returns {Promise<undefined>} -
 */
async function getStorage(ctx, params) {
    const { level, resource: _resource } = params;
    const { resource, id } = _resource;

    if (level !== 'accounts') {
        throw errors.BadRequest
            .customizeDescription(`Unsupported level "${level}". Only "accounts" is currently supported`);
    }

    const [counter, base] = await cache.fetchAccountSizeCounter(id);

    let storageUtilized;

    if (base !== null) {
        storageUtilized = counter + base;
    } else {
        const labelName = serviceToWarp10Label[params.level];
        const labels = { [labelName]: id };
        const options = {
            params: {
                end: now(),
                labels,
                node: config.nodeId,
            },
            macro: 'utapi/getMetricsAt',
        };
        const res = await warp10.exec(options);

        if (res.result.length === 0) {
            ctx.logger.error('unable to retrieve metrics', { level, resource });
            throw errors.InternalError;
        }

        const { sizeD: currentSize } = res.result[0];
        await cache.updateAccountCounterBase(id, currentSize);
        storageUtilized = currentSize;
    }

    ctx.results.statusCode = 200;
    ctx.results.body = {
        storageUtilized,
        resource,
        level,
    };
}

module.exports = getStorage;
