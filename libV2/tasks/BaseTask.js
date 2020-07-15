const cron = require('node-cron');
const cronparser = require('cron-parser');

const { client: cacheClient } = require('../cache');
const Process = require('../process');
const { LoggerContext } = require('../utils');
const Warp10Client = require('../warp10');

const logger = new LoggerContext({
    module: 'BaseTask',
});

class Now {}

class BaseTask extends Process {
    constructor() {
        super();
        this._cache = cacheClient;
        this._warp10 = new Warp10Client();
        this._scheduler = null;
        this._defaultSchedule = Now;
    }

    async _setup() {
        this._program
            .option('-n, --now', 'Execute the task immediately and then exit. Overrides --schedule.')
            .option(
                '-s, --schedule <crontab>',
                'Execute task using this crontab.  Overrides configured schedule',
                value => {
                    cronparser.parseExpression(value);
                    return value;
                },
            );
    }

    get schedule() {
        if (this._program.now) {
            return Now;
        }
        if (this._program.schedule) {
            return this._program.schedule;
        }
        return this._defaultSchedule;
    }

    async _start() {
        await this._cache.connect();
        if (this.schedule === Now) {
            setImmediate(async () => {
                await this.execute();
                this.join();
            });
        } else {
            this._scheduler = cron.schedule(this.schedule,
                async () => {
                    this._scheduler.stop(); // Halt execution to avoid overlapping tasks
                    await this.execute();
                    this._scheduler.start();
                });
            this.on('exit', () => {
                this._scheduler.stop();
                this._scheduler.destroy();
            });
        }
    }

    async execute() {
        try {
            await this._execute(new Date() * 1000);
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
}

module.exports = BaseTask;
