const childProcess = require('child_process');

const async = require('async');
const nodeSchedule = require('node-schedule');

const { jsutil } = require('arsenal');
const werelogs = require('werelogs');

const Datastore = require('./Datastore');
const RedisClient = require('../libV2/redis');

const REINDEX_SCHEDULE = '0 0 * * Sun';
const REINDEX_LOCK_KEY = 's3:utapireindex:lock';
const REINDEX_LOCK_TTL = (60 * 60) * 24;
const REINDEX_PYTHON_INTERPRETER = process.env.REINDEX_PYTHON_INTERPRETER !== undefined
    ? process.env.REINDEX_PYTHON_INTERPRETER
    : 'python3.7';

const EXIT_CODE_SENTINEL_CONNECTION = 100;

class UtapiReindex {
    constructor(config) {
        this._enabled = false;
        this._schedule = REINDEX_SCHEDULE;
        this._redis = {
            name: 'scality-s3',
            sentinelPassword: '',
            sentinels: [{
                host: '127.0.0.1',
                port: 16379,
            }],
        };
        this._bucketd = {
            host: '127.0.0.1',
            port: 9000,
        };
        this._password = '';
        this._log = new werelogs.Logger('UtapiReindex');

        if (config && config.enabled) {
            this._enabled = config.enabled;
        }
        if (config && config.schedule) {
            this._schedule = config.schedule;
        }
        if (config && config.password) {
            this._password = config.password;
        }
        if (config && config.redis) {
            const {
                name, sentinelPassword, sentinels,
            } = config.redis;
            this._redis.name = name || this._redis.name;
            this._redis.sentinelPassword = sentinelPassword || this._redis.sentinelPassword;
            this._redis.sentinels = sentinels || this._redis.sentinels;
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

        this._onlyCountLatestWhenObjectLocked = (config && config.onlyCountLatestWhenObjectLocked === true);

        this._requestLogger = this._log.newRequestLogger();
    }

    _getRedisClient() {
        const client = new RedisClient({
            sentinels: this._redis.sentinels,
            name: this._redis.name,
            sentinelPassword: this._redis.sentinelPassword,
            password: this._password,
        });
        client.connect();
        return client;
    }

    _lock() {
        return this.ds.setExpire(REINDEX_LOCK_KEY, 'true', REINDEX_LOCK_TTL);
    }

    _unLock() {
        return this.ds.del(REINDEX_LOCK_KEY);
    }

    _buildFlags(sentinel) {
        const flags = {
            /* eslint-disable camelcase */
            sentinel_ip: sentinel.host,
            sentinel_port: sentinel.port,
            sentinel_cluster_name: this._redis.name,
            bucketd_addr: `http://${this._bucketd.host}:${this._bucketd.port}`,
        };
        if (this._redis.sentinelPassword) {
            flags.redis_password = this._redis.sentinelPassword;
        }

        /* eslint-enable camelcase */
        const opts = [];
        Object.keys(flags)
            .forEach(flag => {
                const name = `--${flag.replace(/_/g, '-')}`;
                opts.push(name);
                opts.push(flags[flag]);
            });

        if (this._onlyCountLatestWhenObjectLocked) {
            opts.push('--only-latest-when-locked');
        }
        return opts;
    }

    _runScriptWithSentinels(path, remainingSentinels, done) {
        const flags = this._buildFlags(remainingSentinels.shift());
        this._requestLogger.debug(`launching subprocess ${path} with flags: ${flags}`);
        const process = childProcess.spawn(REINDEX_PYTHON_INTERPRETER, [path, ...flags]);
        process.stdout.on('data', data => {
            this._requestLogger.info('received output from script', {
                output: Buffer.from(data).toString(),
                script: path,
            });
        });
        process.stderr.on('data', data => {
            this._requestLogger.debug('received error from script', {
                output: Buffer.from(data).toString(),
                script: path,
            });
        });
        process.on('error', err => {
            this._requestLogger.debug('failed to start process', {
                error: err,
                script: path,
            });
        });
        process.on('close', code => {
            if (code) {
                this._requestLogger.error('script exited with error', {
                    statusCode: code,
                    script: path,
                });
                if (code === EXIT_CODE_SENTINEL_CONNECTION) {
                    if (remainingSentinels.length > 0) {
                        this._requestLogger.info('retrying with next sentinel host', {
                            script: path,
                        });
                        return this._runScriptWithSentinels(path, remainingSentinels, done);
                    }
                    this._requestLogger.error('no more sentinel host to try', {
                        script: path,
                    });
                }
            } else {
                this._requestLogger.info('script exited successfully', {
                    statusCode: code,
                    script: path,
                });
            }
            return done();
        });
    }

    _runScript(path, done) {
        const remainingSentinels = [...this._redis.sentinels];
        this._runScriptWithSentinels(path, remainingSentinels, done);
    }

    _attemptLock(job) {
        this._requestLogger.info('attempting to acquire the lock to begin job');
        this._lock()
            .then(res => {
                if (res) {
                    this._requestLogger
                        .info('acquired the lock, proceeding with job');
                    job();
                } else {
                    this._requestLogger
                        .info('the lock is already acquired, skipping job');
                }
            })
            .catch(err => {
                this._requestLogger.error(
                    'an error occurred when acquiring the lock, skipping job', {
                        stack: err && err.stack,
                    },
                );
            });
    }

    _attemptUnlock() {
        this._unLock()
            .catch(err => {
                this._requestLogger
                    .error('an error occurred when removing the lock', {
                        stack: err && err.stack,
                    });
            });
    }

    _connect(done) {
        const doneOnce = jsutil.once(done);
        const client = this._getRedisClient();
        this.ds = new Datastore().setClient(client);
        client
            .on('ready', doneOnce)
            .on('error', doneOnce);
    }

    _scheduleJob() {
        this._connect(err => {
            if (err) {
                this._requestLogger.error(
                    'could not connect to datastore, skipping', {
                        error: err && err.stack,
                    },
                );
                return undefined;
            }
            return this._attemptLock(() => {
                const scripts = [
                    `${__dirname}/reindex/s3_bucketd.py`,
                    `${__dirname}/reindex/reporting.py`,
                ];
                return async.eachSeries(scripts, (script, next) => {
                    this._runScript(script, next);
                }, () => {
                    this._attemptUnlock();
                });
            });
        });
    }

    _job() {
        const job = nodeSchedule.scheduleJob(this._schedule, () => this._scheduleJob());
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
