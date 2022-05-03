const assert = require('assert');
const cron = require('node-schedule');
const cronparser = require('cron-parser');
const promClient = require('prom-client');
const { DEFAULT_METRICS_ROUTE } = require('arsenal').network.probe.ProbeServer;

const { client: cacheClient } = require('../cache');
const Process = require('../process');
const { LoggerContext, iterIfError, startProbeServer } = require('../utils');

const logger = new LoggerContext({
    module: 'BaseTask',
});

class Now {}

class BaseTask extends Process {
    constructor(options) {
        super();
        assert.notStrictEqual(options, undefined);
        assert(Array.isArray(options.warp10), 'you must provide an array of warp 10 clients');
        this._cache = cacheClient;
        this._warp10Clients = options.warp10;
        this._scheduler = null;
        this._defaultSchedule = Now;
        this._defaultLag = 0;
        this._enableMetrics = options.enableMetrics || false;
        this._metricsHost = options.metricsHost || 'localhost';
        this._metricsPort = options.metricsPort || 9001;
        this._metricsHandlers = null;
        this._probeServer = null;
    }

    async _setup(includeDefaultOpts = true) {
        if (includeDefaultOpts) {
            this._program
                .option('-n, --now', 'Execute the task immediately and then exit. Overrides --schedule.')
                .option(
                    '-s, --schedule <crontab>',
                    'Execute task using this crontab.  Overrides configured schedule',
                    value => {
                        cronparser.parseExpression(value);
                        return value;
                    },
                )
                .option('-l, --lag <lag>', 'Set a custom lag time in seconds', v => parseInt(v, 10))
                .option('-n, --node-id <id>', 'Set a custom node id');
        }

        if (this._enableMetrics) {
            this._metricsHandlers = {
                ...this._registerDefaultMetricHandlers(),
                ...this._registerMetricHandlers(),
            };
            await this._createProbeServer();
        }
    }

    _registerDefaultMetricHandlers() {
        const taskName = this.constructor.name;

        // Get the name of our subclass in snake case format eg BaseClass => _base_class
        const taskNameSnake = taskName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

        const executionDuration = new promClient.Gauge({
            name: `utapi${taskNameSnake}_duration_seconds`,
            help: `Execution time of the ${taskName} task`,
            labelNames: ['origin', 'containerName'],
        });

        const executionAttempts = new promClient.Counter({
            name: `utapi${taskNameSnake}_attempts_total`,
            help: `Number of attempts to execute the ${taskName} task`,
            labelNames: ['origin', 'containerName'],
        });

        const executionFailures = new promClient.Counter({
            name: `utapi${taskNameSnake}_failures_total`,
            help: `Number of failures executing the ${taskName} task`,
            labelNames: ['origin', 'containerName'],
        });

        return {
            executionDuration,
            executionAttempts,
            executionFailures,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    _registerMetricHandlers() {
        return {};
    }

    async _createProbeServer() {
        this._probeServer = await startProbeServer({
            bindAddress: this._metricsHost,
            port: this._metricsPort,
        });

        this._probeServer.addHandler(
            DEFAULT_METRICS_ROUTE,
            (res, log) => {
                log.debug('metrics requested');
                res.writeHead(200, {
                    'Content-Type': promClient.register.contentType,
                });
                promClient.register.metrics().then(metrics => {
                    res.end(metrics);
                });
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

    get lag() {
        if (this._program.lag !== undefined) {
            return this._program.lag;
        }
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
        let endTimer;
        if (this._enableMetrics) {
            endTimer = this._metricsHandlers.executionDuration.startTimer();
            this._metricsHandlers.executionAttempts.inc(1);
        }

        try {
            const timestamp = new Date() * 1000; // Timestamp in microseconds;
            const laggedTimestamp = timestamp - (this.lag * 1000000);
            await this._execute(laggedTimestamp);
        } catch (error) {
            logger.error('Error during task execution', { error });
            this._metricsHandlers.executionFailures.inc(1);
        }

        if (this._enableMetrics) {
            endTimer();
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async _execute(timestamp) {
        logger.info(`Default Task ${timestamp}`);
    }

    async _join() {
        if (this._probeServer !== null) {
            this._probeServer.stop();
        }
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
