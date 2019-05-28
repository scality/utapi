const childProcess = require('child_process');
const nodeSchedule = require('node-schedule');
const werelogs = require('werelogs');

const DEFAULT_REINDEX_SCHEDULE = '* * * * * 7';

class UtapiReindex {

    constructor(config) {
        this._enabled = false;
        this._schedule = DEFAULT_REINDEX_SCHEDULE;
        this._log = new werelogs.Logger('UtapiReindex');

        if (config && config.enabled) {
            this._enabled = config.enabled;
        }
        if (config && config.schedule) {
            this._schedule = config.schedule;
        }
        if (config && config.log) {
            const { level, dump } = config.log;
            this._log = new werelogs.Logger('UtapiReindex', { level, dump });
        }
        this._requestLogger = this._log.newRequestLogger();
    }

    _runScript(path) {
        const process = childProcess.spawn('python3.6', [path]);
        process.stdout.on('data', data => {
            this._requestLogger.info('received output from job', {
                output: new Buffer(data).toString(),
            });
        });
    }

    _cron() {
        const job = nodeSchedule.scheduleJob(this._schedule, () => {
            this._runScript(`${__dirname}/reindex/s3_bucketd.py`);
            this._runScript(`${__dirname}/reindex/reporting.py`);
        });
        if (!job) {
            this._log.error('could not initiate job schedule');
            return undefined;
        }
        job.on('scheduled', () => {
            this._requestLogger = this._log.newRequestLogger();
            this._requestLogger.info('utapi reindex job scheduled', {
                schedule: this._schedule,
            });
        });
        job.on('run', () => {
            this._requestLogger.info('utapi reindex job started');
        });
        return undefined;
    }

    start() {
        if (this._enabled) {
            this._log.info('initiating job schedule', {
                schedule: this._schedule,
            });
            this._cron();
        } else {
            this._log.info('utapi reindex is disabled');
        }
        return this;
    }
}

module.exports = UtapiReindex;
