const errors = require('../../../errors');
const { serviceToWarp10Label } = require('../../../constants');
const { clients: warp10Clients } = require('../../../warp10');
const { client: cache } = require('../../../cache');
const { now, iterIfError } = require('../../../utils');

/**
 *
 * @param {RequestContext} ctx - request context
 * @param {object} params - request parameters
 * @param {string} params.level - metric level
 * @param {string} params.resource - Id of the requested resource
 * @returns {Promise<undefined>} -
 */
async function getStorage(ctx, params) {
    const { level, resource } = params;

    if (level !== 'accounts') {
        throw errors.BadRequest
            .customizeDescription(`Unsupported level "${level}". Only "accounts" is currently supported`);
    }

    const [counter, base] = await cache.fetchAccountSizeCounter(resource);

    let storageUtilized;

    if (base !== null) {
        storageUtilized = counter + base;
    } else {
        const labelName = serviceToWarp10Label[params.level];
        const labels = { [labelName]: resource };

        const res = await iterIfError(warp10Clients, warp10 => {
            const options = {
                params: {
                    end: now(),
                    labels,
                    node: warp10.nodeId,
                },
                macro: 'utapi/getMetricsAt',
            };
            return warp10.exec(options);
        }, error => ctx.logger.error('error while fetching metrics', { error }));

        if (res.result.length === 0) {
            ctx.logger.error('unable to retrieve metrics', { level, resource });
            throw errors.InternalError;
        }

        const { sizeD: currentSize } = res.result[0];
        await cache.updateAccountCounterBase(resource, currentSize);
        storageUtilized = currentSize;
    }

    ctx.results.statusCode = 200;
    ctx.results.body = {
        storageUtilized: Math.max(storageUtilized, 0),
        resource,
        level,
    };
}

module.exports = getStorage;
