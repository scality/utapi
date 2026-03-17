const async = require('async');
const BaseTask = require('./BaseTask');
const UtapiClient = require('../client');
const { LoggerContext } = require('../utils');

const logger = new LoggerContext({
    module: 'ManualAdjust',
});

function collectArgs(arg, prev) {
    return prev.concat([arg]);
}

class ManualAdjust extends BaseTask {
    async _setup() {
        // Don't include default flags
        await super._setup(false);
        this._program
            .option('-h, --host <host>', 'Utapi server host', '127.0.0.1')
            .option('-p, --port <port>', 'Utapi server port', '8100', parseInt)
            .option('-b, --bucket <buckets...>', 'target these buckets', collectArgs, [])
            .option('-a, --account <accounts...>', 'target these accounts', collectArgs, [])
            .option('-u, --user <users...>', 'target these users', collectArgs, [])
            .requiredOption('-o, --objects <adjustment>', 'adjust numberOfObjects by this amount', parseInt)
            .requiredOption('-s, --storage <adjustment>', 'adjust storageUtilized by this amount', parseInt);
    }

    async _start() {
        const opts = this._program.opts();
        this._utapiClient = new UtapiClient({
            host: opts.host,
            port: opts.port,
            disableRetryCache: true,
        });
        await super._start();
    }

    async _pushAdjustmentMetric(metric) {
        logger.info('pushing adjustment metric', { metric });
        await this._utapiClient.pushMetric(metric);
    }

    async _execute() {
        const timestamp = Date.now();

        const opts = this._program.opts();
        const objectDelta = opts.objects;
        const sizeDelta = opts.storage;

        if (!opts.bucket.length && !opts.account.length && !opts.user.length) {
            throw Error('You must provided at least one of --bucket, --account or --user');
        }

        logger.info('writing adjustments');
        if (opts.bucket.length) {
            logger.info('adjusting buckets');
            await async.eachSeries(
                opts.bucket,
                async bucket => this._pushAdjustmentMetric({
                    bucket, objectDelta, sizeDelta, timestamp,
                }),
            );
        }

        if (opts.account.length) {
            logger.info('adjusting accounts');
            await async.eachSeries(
                opts.account,
                async account => this._pushAdjustmentMetric({
                    account, objectDelta, sizeDelta, timestamp,
                }),
            );
        }

        if (opts.user.length) {
            logger.info('adjusting users');
            await async.eachSeries(
                this._program.user,
                async user => this._pushAdjustmentMetric({
                    user, objectDelta, sizeDelta, timestamp,
                }),
            );
        }
    }
}

module.exports = ManualAdjust;
