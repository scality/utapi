const errors = require('../../../errors');
const { serviceToWarp10Label, operationToResponse } = require('../../../constants');
const { convertTimestamp } = require('../../../utils');
const { client: warp10 } = require('../../../warp10');
const { client: cache } = require('../../../cache');
const { now } = require('../../../utils');
const config = require('../../../config');


async function getStorage(ctx, params) {
    const { level, resource } = params;
    if (level !== 'accounts') {
        throw errors.InvalidRequest.customizeDescription(`Invalid metrics level ${level}`);
    }

    const [counter, base] = await cache.fetchAccountSizeCounter(resource);

    let storageUtilized;

    if (base !== null) {
        storageUtilized = counter + base;
    } else {
        const labelName = serviceToWarp10Label[params.level];
        const labels = { [labelName]: resource };
        const options = {
            params: {
                end: now(),
                labels,
                node: config.nodeId,
            },
            macro: 'utapi/getMetricsAt',
        };
        const res = await warp10.exec(options);
        console.log(res)
        if (res.result.length === 0) {
            ctx.logger.error('unable to retrieve metrics', { level, resource });
            throw errors.InternalError;
        }

        const { sizeD: currentSize } = res.result[0];
        await cache.updateAccountCounterBase(resource, currentSize);
        storageUtilized = currentSize;
    }

    ctx.results.statusCode = 200;
    ctx.results.body = { storageUtilized };
}

module.exports = getStorage;
