const BaseTask = require('./BaseTask');
const config = require('../config');
const { checkpointLagSecs, indexedEventFields } = require('../constants');
const { LoggerContext, comprehend } = require('../utils');

const logger = new LoggerContext({
    module: 'CreateCheckpoint',
});

function _updateCheckpoint(checkpoint, metric) {
    return {
        objD: checkpoint.objD + metric.objD,
        sizeD: checkpoint.sizeD + metric.sizeD,
        inB: checkpoint.inB + metric.inB,
        outB: checkpoint.outB + metric.outB,
    };
}

function _checkpointFactory(labels) {
    const checkpoints = comprehend(labels, key => ({ key, value: {} }));
    return {
        update: metric => {
            labels
                .filter(label => !!metric[label])
                .forEach(label => {
                    const value = metric[label];
                    const checkpoint = checkpoints[label][value];
                    checkpoints[label][value] = _updateCheckpoint(checkpoint, metric);
                });
        },
        checkpoints: () => (checkpoints),
    };
}

class CreateCheckpoint extends BaseTask {
    constructor(options) {
        super(options);
        this._defaultSchedule = config.checkpointSchedule;
        this._defaultLag = checkpointLagSecs;
    }

    async _execute(timestamp) {
        logger.debug('creating checkpoints', { checkpointTimestamp: timestamp });
        const status = await this.withWarp10(async warp10 => {
            const params = {
                params: {
                    nodeId: warp10.nodeId,
                    end: timestamp.toString(),
                    fields: indexedEventFields,
                },
                macro: 'utapi/createCheckpoint',
            };
            return warp10.exec(params);
        });
        if (status.result[0]) {
            logger.info(`created ${status.result[0] || 0} checkpoints`);
        }
    }
}

module.exports = CreateCheckpoint;
