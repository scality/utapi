import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * Reads from a config file and returns the content as a config object
 */
class Config {
    constructor() {
        /*
         * By default, the config file is "config.json" at the root.
         * It can be overridden using the UTAPI_CONFIG_FILE environment var.
         */
        this._basePath = path.resolve(__dirname, '..');
        this.path = `${this._basePath}/../config.json`;
        if (process.env.UTAPI_CONFIG_FILE !== undefined) {
            this.path = process.env.UTAPI_CONFIG_FILE;
        }

        // Read config automatically
        this._getConfig();
    }

    _getConfig() {
        let config;
        try {
            const data = fs.readFileSync(this.path, { encoding: 'utf-8' });
            config = JSON.parse(data);
        } catch (err) {
            throw new Error(`could not parse config file: ${err.message}`);
        }

        // Optional: The port for the server to listen on.
        this.port = 8100;
        if (config.port) {
            assert(Number.isInteger(config.port) && config.port > 0,
                'bad config: port must be a positive integer');
            this.port = config.port;
        }

        // Optional: The number of workers to start the server with.
        this.workers = 5;
        if (config.workers) {
            assert(Number.isInteger(config.workers) && config.workers > 0,
                'bad config: workers must be a positive integer');
            this.workers = config.workers;
        }

        // Optional: Value of the replay schedule should be cron-style
        // scheduling. For example, every five minutes: '*/5 * * * *'.
        this.replaySchedule = '*/5 * * * *';
        if (config.replaySchedule) {
            assert(typeof config.replaySchedule === 'string', 'bad ' +
                'config: utapi.replaySchedule must be a string');
            this.replaySchedule = config.replaySchedule;
        }

        // Optional: The number of elements processed by each call to the Redis
        // local cache during a replay.
        this.batchSize = 10;
        if (config.batchSize) {
            assert(typeof config.batchSize === 'number', 'bad config: ' +
                'utapi.batchSize must be a number');
            assert(config.batchSize > 0, 'bad config: utapi.batchSize must ' +
                'be a number greater than 0');
            this.batchSize = config.batchSize;
        }

        // Optional: The resource types to push metrics for.
        this.metrics = ['buckets', 'accounts', 'users', 'service'];
        if (config.metrics) {
            assert(Array.isArray(config.metrics), 'bad config: metrics must ' +
                'be an array');
            assert(config.metrics.length !== 0, 'bad config: metrics array ' +
                'cannot be empty');
            this.metrics = config.metrics;
        }

        // Optional: The component Utapi pushes metrics for.
        this.component = 's3';
        if (config.component) {
            assert(typeof config.component === 'string', 'bad config: ' +
                'component must be a string');
            this.component = config.component;
        }

        assert(typeof config.localCache === 'object', 'bad config: invalid ' +
            'local cache configuration. localCache must be an object');
        assert(config.localCache.host,
            'bad config: localCache.host is undefined');
        assert(config.localCache.port,
            'bad config: localCache.port is undefined');
        assert(typeof config.localCache.host === 'string', 'bad config: ' +
            'invalid host for localCache. host must be a string');
        assert(typeof config.localCache.port === 'number', 'bad config: ' +
            'invalid port for localCache. port must be a number');

        this.localCache = {
            host: config.localCache.host,
            port: config.localCache.port,
        };

        assert(config.log, 'bad config: log is undefined');
        assert(config.log.logLevel, 'bad config: log.logLevel is undefined');
        assert(config.log.dumpLevel, 'bad config: log.dumpLevel is undefined');
        assert(typeof config.log.logLevel === 'string', 'bad config: ' +
            'log.logLevel must be a string');
        assert(typeof config.log.dumpLevel === 'string', 'bad config: ' +
            'log.dumpLevel must be a string');

        this.log = {
            logLevel: config.log.logLevel,
            dumpLevel: config.log.dumpLevel,
        };

        assert(config.healthChecks, 'bad config: healthChecks is undefined');
        assert(config.healthChecks.allowFrom, 'bad config: ' +
            'healthChecks.allowFrom is undefined');
        assert(config.healthChecks.allowFrom, 'bad config: ' +
            'healthChecks.allowFrom is undefined');
        assert(Array.isArray(config.healthChecks.allowFrom), 'bad config: ' +
            'invalid healthcheck configuration. allowFrom must be an array');
        config.healthChecks.allowFrom.forEach(item =>
            assert(typeof item === 'string', 'bad config: invalid' +
            'healthcheck configuration. allowFrom IP address must be a ' +
            'string'));

        this.healthChecks = { allowFrom: config.healthChecks.allowFrom };

        // check for standalone configuration
        assert(config.redis, 'bad config: redis is undefined');
        assert(config.redis.host, 'bad config: redis.host is undefined');
        assert(config.redis.port, 'bad config: redis.port is undefined');
        assert(typeof config.redis.host === 'string', 'bad config: ' +
            'redis.host must be a string');
        assert(typeof config.redis.port === 'number', 'bad config: ' +
            'redis.port must be a number');

        this.redis = {
            host: config.redis.host,
            port: config.redis.port,
        };

        if (config.redis.sentinels) {
            assert(typeof config.redis.name === 'string',
                'bad config: sentinel name must be a string');
            this.redis.name = config.redis.name;
            assert(Array.isArray(config.redis.sentinels),
                'bad config: sentinels must be an array');
            this.redis.sentinels = [];
            config.redis.sentinels.forEach(item => {
                const { host, port } = item;
                assert(typeof host === 'string',
                    'bad config: sentinel host must be a string');
                assert(typeof port === 'number',
                    'bad config: sentinel port must be a number');
                this.redis.sentinels.push({ host, port });
            });
        }

        assert(config.vaultd, 'bad config: vaultd is undefined');
        assert(config.vaultd.port, 'bad config: vaultd.port is undefined');
        assert(config.vaultd.host, 'bad config: vaultd.host is undefined');
        assert(Number.isInteger(config.vaultd.port) && config.vaultd.port > 0,
            'bad config: vaultd.port must be a positive integer');
        assert.strictEqual(typeof config.vaultd.host, 'string', 'bad config: ' +
            'vaultd.host must be a string');

        this.vaultd = {
            port: config.vaultd.port,
            host: config.vaultd.host,
        };

        if (config.certFilePaths) {
            assert(typeof config.certFilePaths === 'object' &&
                typeof config.certFilePaths.key === 'string' &&
                typeof config.certFilePaths.cert === 'string' && ((
                    config.certFilePaths.ca &&
                    typeof config.certFilePaths.ca === 'string') ||
                    !config.certFilePaths.ca)
               );
        }
        const { key, cert, ca } = config.certFilePaths ?
            config.certFilePaths : {};
        if (key && cert) {
            const keypath = (key[0] === '/') ? key : `${this._basePath}/${key}`;
            const certpath = (cert[0] === '/') ?
                cert : `${this._basePath}/${cert}`;
            let capath = undefined;
            if (ca) {
                capath = (ca[0] === '/') ? ca : `${this._basePath}/${ca}`;
                assert.doesNotThrow(() =>
                    fs.accessSync(capath, fs.F_OK | fs.R_OK),
                    `File not found or unreachable: ${capath}`);
            }
            assert.doesNotThrow(() =>
                fs.accessSync(keypath, fs.F_OK | fs.R_OK),
                `File not found or unreachable: ${keypath}`);
            assert.doesNotThrow(() =>
                fs.accessSync(certpath, fs.F_OK | fs.R_OK),
                `File not found or unreachable: ${certpath}`);
            this.https = {
                cert: fs.readFileSync(certpath, 'ascii'),
                key: fs.readFileSync(keypath, 'ascii'),
                ca: ca ? fs.readFileSync(capath, 'ascii') : undefined,
            };
            this.httpsPath = {
                ca: capath,
                cert: certpath,
            };
        } else if (key || cert) {
            throw new Error('bad config: both certFilePaths.key and ' +
                'certFilePaths.cert must be defined');
        }

        return config;
    }
}

export default new Config();
