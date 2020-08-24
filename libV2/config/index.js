const fs = require('fs');
const path = require('path');
const Joi = require('@hapi/joi');
const assert = require('assert');

const { truthy, envNamespace } = require('../constants');
const configSchema = require('./schema');

function _splitServer(text) {
    assert.notStrictEqual(text.indexOf(':'), -1);
    const [host, port] = text.split(':').map(v => v.trim());
    return {
        host,
        port: Number.parseInt(port, 10),
    };
}

const _typeCasts = {
    bool: val => truthy.has(val.toLowerCase()),
    int: val => parseInt(val, 10),
    list: val => val.split(',').map(v => v.trim()),
    serverList: val => val.split(',').map(v => v.trim()).map(_splitServer),
};


function _definedInEnv(key) {
    return process.env[`${envNamespace}_${key}`] !== undefined;
}

function _loadFromEnv(key, defaultValue, type) {
    const envKey = `${envNamespace}_${key}`;
    const value = process.env[envKey];
    if (value !== undefined) {
        if (type !== undefined) {
            return type(value);
        }
        return value;
    }
    return defaultValue;
}


const defaultConfigPath = path.join(__dirname, '../../config.json');

class Config {
    /**
     * Returns a new Config instance merging the loaded config with the provided values.
     * Passed values override loaded ones recursively.
     *
     * @param {object} overrides - an object using the same structure as the config file
     * @returns {Config} - New Config instance
     */
    constructor(overrides) {
        this._basePath = path.join(__dirname, '../../');
        this._configPath = _loadFromEnv('CONFIG_FILE', defaultConfigPath);
        this._defaultsPath = path.join(__dirname, 'defaults.json');

        this.host = undefined;
        this.port = undefined;

        this.healthChecks = undefined;
        this.logging = { level: 'debug', dumpLevel: 'error' };

        this.redis = undefined;
        this.warp10 = undefined;

        // read config automatically
        const loadedConfig = this._loadConfig();
        let parsedConfig = this._parseConfig(loadedConfig);
        if (typeof overrides === 'object') {
            parsedConfig = this._recursiveUpdate(parsedConfig, overrides);
        }
        Object.assign(this, parsedConfig);
    }

    static _readFile(path, encoding = 'utf-8') {
        assert.doesNotThrow(
            // eslint-disable-next-line no-bitwise
            () => fs.accessSync(path, fs.F_OK | fs.R_OK),
            `File not found or unreachable: ${path}`,
        );
        try {
            return fs.readFileSync(path, { encoding });
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error({ message: `error reading file at ${path}`, error });
            throw error;
        }
    }

    static _readJSON(path) {
        const data = Config._readFile(path);
        try {
            return JSON.parse(data);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error({ message: `error parsing JSON from file at ${path}`, error });
            throw error;
        }
    }

    _loadDefaults() {
        return Config._readJSON(this._defaultsPath);
    }

    _loadUserConfig() {
        return Joi.attempt(
            Config._readJSON(this._configPath),
            configSchema,
            'invalid Utapi config',
        );
    }

    _recursiveUpdateArray(parent, child) {
        const ret = [];
        for (let i = 0; i < Math.max(parent.length, child.length); i += 1) {
            ret[i] = this._recursiveUpdate(parent[i], child[i]);
        }
        return ret;
    }

    _recursiveUpdateObject(parent, child) {
        return Array.from(
            new Set([
                ...Object.keys(parent),
                ...Object.keys(child)],
            // eslint-disable-next-line function-paren-newline
            ))
            .reduce((ret, key) => {
                // eslint-disable-next-line no-param-reassign
                ret[key] = this._recursiveUpdate(parent[key], child[key]);
                return ret;
            }, {});
    }

    /**
     * Given two nested Object/Array combos, walk each and return a new object
     * with values from child overwriting parent.
     * @param {*} parent - Initial value
     * @param {*} child - New value
     * @returns {*} - Merged value
     */
    _recursiveUpdate(parent, child) {
        // If no parent value use the child
        if (parent === undefined) {
            return child;
        }
        // If no child value use the parent
        if (child === undefined) {
            return parent;
        }
        if (Array.isArray(parent) && Array.isArray(child)) {
            return this._recursiveUpdateArray(parent, child);
        }
        if (typeof parent === 'object' && typeof child === 'object') {
            return this._recursiveUpdateObject(parent, child);
        }
        return child;
    }

    _loadConfig() {
        const defaultConf = this._loadDefaults();
        const userConf = this._loadUserConfig();
        return this._recursiveUpdateObject(defaultConf, userConf);
    }

    static _parseRedisConfig(config) {
        const redisConf = {};
        if (config.sentinels || _definedInEnv('REDIS_SENTINELS')) {
            redisConf.name = _loadFromEnv('REDIS_NAME', config.name);
            const sentinels = _loadFromEnv(
                'REDIS_SENTINELS',
                config.sentinels,
                _typeCasts.list,
            );
            redisConf.sentinels = sentinels.map(v => {
                if (typeof v === 'string') {
                    const [host, port] = v.split(':');
                    return { host, port: Number.parseInt(port, 10) };
                }
                return v;
            });
            redisConf.sentinelPassword = _loadFromEnv(
                'REDIS_SENTINEL_PASSWORD',
                config.sentinelPassword,
            );
        } else {
            redisConf.host = _loadFromEnv(
                'REDIS_HOST',
                config.host,
            );
            redisConf.port = _loadFromEnv(
                'REDIS_PORT',
                config.port,
                _typeCasts.int,
            );
            redisConf.password = _loadFromEnv(
                'REDIS_PASSWORD',
                config.password,
            );
        }
        return redisConf;
    }

    _loadCertificates(config) {
        const { key, cert, ca } = config;

        const keyPath = path.isAbsolute(key) ? key : path.join(this._basePath, key);
        const certPath = path.isAbsolute(cert) ? cert : path.join(this._basePath, cert);

        const certs = {
            cert: Config._readFile(certPath, 'ascii'),
            key: Config._readFile(keyPath, 'ascii'),
        };

        if (ca) {
            const caPath = path.isAbsolute(ca) ? ca : path.join(this._basePath, ca);
            certs.ca = Config._readFile(caPath, 'ascii');
        }

        return certs;
    }

    _parseConfig(config) {
        const parsedConfig = {};

        parsedConfig.development = _loadFromEnv('DEV_MODE', config.development, _typeCasts.bool);

        parsedConfig.nodeId = _loadFromEnv('NODE_ID', config.nodeId);

        parsedConfig.host = _loadFromEnv('HOST', config.host);
        parsedConfig.port = _loadFromEnv('PORT', config.port, _typeCasts.int);

        const healthCheckFromEnv = _loadFromEnv(
            'ALLOW_HEALTHCHECK',
            [],
            _typeCasts.list,
        );
        parsedConfig.healthChecks = {
            allowFrom: healthCheckFromEnv.concat(config.healthChecks.allowFrom),
        };

        const certPaths = {
            cert: _loadFromEnv('TLS_CERT', config.certFilePaths.cert),
            key: _loadFromEnv('TLS_KEY', config.certFilePaths.key),
            ca: _loadFromEnv('TLS_CA', config.certFilePaths.ca),
        };
        if (certPaths.key && certPaths.cert) {
            parsedConfig.tls = this._loadCertificates(certPaths);
        } else if (certPaths.key || certPaths.cert) {
            throw new Error('bad config: both certFilePaths.key and certFilePaths.cert must be defined');
        }

        parsedConfig.redis = Config._parseRedisConfig(config.redis);

        parsedConfig.cache = Config._parseRedisConfig(config.localCache);
        parsedConfig.cache.backend = _loadFromEnv('CACHE_BACKEND', config.cacheBackend);

        const warp10Conf = {
            readToken: _loadFromEnv('WARP10_READ_TOKEN', config.warp10.readToken),
            writeToken: _loadFromEnv('WARP10_WRITE_TOKEN', config.warp10.writeToken),
        };

        parsedConfig.warp10 = warp10Conf;

        if (Array.isArray(config.warp10.hosts) || _definedInEnv('WARP10_HOSTS')) {
            warp10Conf.hosts = _loadFromEnv('WARP10_HOSTS', config.warp10.hosts, _typeCasts.serverList);
        } else {
            warp10Conf.host = _loadFromEnv('WARP10_HOST', config.warp10.host);
            warp10Conf.port = _loadFromEnv('WARP10_PORT', config.warp10.port, _typeCasts.int);
        }

        parsedConfig.logging = {
            level: parsedConfig.development
                ? 'debug'
                : _loadFromEnv('LOG_LEVEL', config.log.logLevel),
            dumpLevel: _loadFromEnv(
                'LOG_DUMP_LEVEL',
                config.log.dumpLevel,
            ),
        };

        parsedConfig.ingestionSchedule = _loadFromEnv('INGESTION_SCHEDULE', config.ingestionSchedule);
        parsedConfig.checkpointSchedule = _loadFromEnv('CHECKPOINT_SCHEDULE', config.checkpointSchedule);
        parsedConfig.snapshotSchedule = _loadFromEnv('SNAPSHOT_SCHEDULE', config.snapshotSchedule);
        parsedConfig.repairSchedule = _loadFromEnv('REPAIR_SCHEDULE', config.repairSchedule);

        parsedConfig.vaultd = {
            host: _loadFromEnv('VAULT_HOST', config.vaultd.host),
            port: _loadFromEnv('VAULT_PORT', config.vaultd.port),
        };

        return parsedConfig;
    }

    /**
     * Returns a new Config instance merging the loaded config with the provided values.
     * Passed values override loaded ones recursively.
     *
     * @param {object} newConfig - an object using the same structure as the config file
     * @returns {Config} - New Config instance
     */
    static merge(newConfig) {
        return new Config(newConfig);
    }
}

module.exports = new Config();
