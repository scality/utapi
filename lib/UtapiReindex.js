const childProcess = require('child_process');

const async = require('async');
const nodeSchedule = require('node-schedule');
const werelogs = require('werelogs');

const Datastore = require('./Datastore');
const redisClient = require('../utils/redisClient');

const REINDEX_SCHEDULE = '* * * * * 7';
const REINDEX_LOCK_KEY = 's3:utapireindex:lock';
const REINDEX_LOCK_TTL = ((60 * 60) * 60) * 24;

class UtapiReindex {

    constructor(config) {
        this._enabled = false;
        this._schedule = REINDEX_SCHEDULE;
        this._sentinel = {
            host: '127.0.0.1',
            port: 16379,
            name: 'scality-s3',
        };
        this._bucketd = {
            host: '127.0.0.1',
            port: 9000,
        };
        this._log = new werelogs.Logger('UtapiReindex');

        if (config && config.enabled) {
            this._enabled = config.enabled;
        }
        if (config && config.schedule) {
            this._schedule = config.schedule;
        }
        if (config && config.sentinel) {
            const { host, port, name } = config.sentinel;
            this._sentinel.host = host || this._sentinel.host;
            this._sentinel.port = port || this._sentinel.port;
            this._sentinel.name = name || this._sentinel.name;
        }
        if (config && config.bucketd) {
            const { host, port } = config.bucketd;
            this._bucketd.host = host || this._bucketd.host;
            this._bucketd.port = port || this._bucketd.port;
        }
        if (config && config.log) {
            const { level, dump } = config.log;
            this._log = new werelogs.Logger('UtapiReindex', { level, dump });
        }

        this.ds = new Datastore().setClient(redisClient({
            sentinels: [{
                host: this._sentinel.host,
                port: this._sentinel.port,
            }],
            name: this._sentinel.name,
        }, this._log));
        this._requestLogger = this._log.newRequestLogger();
    }

    _lock() {
        return this.ds
            .setExpire(REINDEX_LOCK_KEY, 'true', REINDEX_LOCK_TTL)
            .catch(err => {
                this._log.error('an error occurred when acquiring the lock', {
                    error: err,
                });
            });
    }

    _unLock() {
        return this.ds
            .del(REINDEX_LOCK_KEY)
            .catch(err => {
                this._log.error('an error occurred when removing the lock', {
                    error: err,
                });
            });
    }

    _runScript(path, done) {
        const process = childProcess.spawn('python3.4', [
            path,
            this._sentinel.host,
            this._sentinel.port,
            this._sentinel.name,
            this._bucketd.host,
            this._bucketd.port,
        ]);
        process.stdout.on('data', data => {
            this._requestLogger.info('received output from script', {
                output: new Buffer(data).toString(),
                script: path,
            });
        });
        process.stderr.on('data', data => {
            this._requestLogger.error('received error from script', {
                output: new Buffer(data).toString(),
                script: path,
            });
        });
        process.on('close', code => {
            if (code) {
                this._requestLogger.error('script exited with error', {
                    statusCode: code,
                    script: path,
                });
            } else {
                this._requestLogger.info('script exited successfully', {
                    statusCode: code,
                    script: path,
                });
            }
            return done();
        });
    }

    _scheduleJob() {
        this._log.info('attempting to acquire the lock to begin job');
        this._lock().then(res => {
            if (!res) {
                this._log.info('the lock is already acquired, skipping job');
                return undefined;
            }
            this._log.info('acquired the lock, proceeding with job');
            const scripts = [
                `${__dirname}/reindex/s3_bucketd.py`,
                `${__dirname}/reindex/reporting.py`,
            ];
            return async.eachSeries(scripts, (script, next) => {
                this._runScript(script, next);
            }, () => {
                this._unLock();
            });
        });
    }

    _job() {
        const job =
            nodeSchedule.scheduleJob(this._schedule, () => this._scheduleJob());
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
        return undefined;
    }

    start() {
        if (this._enabled) {
            this._log.info('initiating job schedule', {
                schedule: this._schedule,
            });
            this._job();
        } else {
            this._log.info('utapi reindex is disabled');
        }
        return this;
    }
}

module.exports = UtapiReindex;
