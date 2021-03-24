const assert = require('assert');
const cron = require('node-schedule');
const cronparser = require('cron-parser');

const { client: cacheClient, buildCacheClient } = require('../cache');
const SubSystem = require('../subsystem');

const { LoggerContext, iterIfError } = require('../utils');
const { buildWarp10Clients } = require('../warp10');

const logger = new LoggerContext({
    module: 'BaseTask',
});

class Now {}

class BaseTask extends SubSystem {
    constructor(config) {
        super(config);
        // TODO construct cache client here rather than globally
        this._cache = null;
        this._warp10Clients = null;
        this._scheduler = null;
        this._defaultSchedule = Now;
        this._defaultLag = 0;
    }

    async _setup(config) {
        this._nodeId = config.nodeId;
        this._cache = buildCacheClient(config.cache);
        this._warp10Clients = buildWarp10Clients(config.warp10.hosts);
        // if (includeDefaultOpts) {
        //     this._program
        //         .option('-n, --now', 'Execute the task immediately and then exit. Overrides --schedule.')
        //         .option(
        //             '-s, --schedule <crontab>',
        //             'Execute task using this crontab.  Overrides configured schedule',
        //             value => {
        //                 cronparser.parseExpression(value);
        //                 return value;
        //             },
        //         )
        //         .option('-l, --lag <lag>', 'Set a custom lag time in seconds', v => parseInt(v, 10))
        //         .option('-n, --node-id <id>', 'Set a custom node id');
        // }
    }

    get schedule() {
        // if (this._program.now) {
        //     return Now;
        // }
        // if (this._program.schedule) {
        //     return this._program.schedule;
        // }
        return this._defaultSchedule;
    }

    get lag() {
        // if (this._program.lag !== undefined) {
        //     return this._program.lag;
        // }
        return this._defaultLag;
    }

    async _start() {
        await this._cache.connect();
        if (this.schedule === Now) {
            setImmediate(async () => {
                await this.execute();
                this.join();
            });
        } else {
            this._scheduler = cron.scheduleJob(this.schedule,
                async () => {
                    this._scheduler.cancel(); // Halt execution to avoid overlapping tasks
                    await this.execute();
                    this._scheduler.reschedule(this.schedule);
                });
            this.on('exit', () => {
                this._scheduler.cancel();
            });
        }
    }

    async execute() {
        try {
            const timestamp = new Date() * 1000; // Timestamp in microseconds;
            const laggedTimestamp = timestamp - (this.lag * 1000000);
            await this._execute(laggedTimestamp);
        } catch (error) {
            logger.error('Error during task execution', { error });
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async _execute(timestamp) {
        logger.info(`Default Task ${timestamp}`);
    }

    async _join() {
        return this._cache.disconnect();
    }

    withWarp10(func, onError) {
        return iterIfError(this._warp10Clients, func, error => {
            if (onError) {
                onError(error);
            } else {
                const {
                    name, code, message, stack,
                } = error;
                logger.error('error during warp 10 request', {
                    error: {
                        name, code, errmsg: message, stack: name !== 'RequestError' ? stack : undefined,
                    },
                });
            }
        });
    }
}

module.exports = BaseTask;
