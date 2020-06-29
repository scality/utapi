const fs = require('fs');
const path = require('path');
const Joi = require('@hapi/joi');

const { truthy, envNamespace } = require('../constants');
const configSchema = require('./schema');

const _typeCasts = {
    bool: val => truthy.has(val.toLowerCase()),
    int: val => parseInt(val, 10),
    list: val => val.split(',').map(v => v.trim()),
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
        let parsedConfig = Config._parseConfig(loadedConfig);
        if (typeof overrides === 'object') {
            parsedConfig = this._recursiveUpdate(parsedConfig, overrides);
        }
        Object.assign(this, parsedConfig);
    }

    static _readFile(path) {
        try {
            const data = fs.readFileSync(path, {
                encoding: 'utf-8',
            });
            return JSON.parse(data);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error({ message: `error reading config file at ${path}`, error });
            throw error;
        }
    }

    _loadDefaults() {
        return Config._readFile(this._defaultsPath);
    }

    _loadUserConfig() {
        return Joi.attempt(
            Config._readFile(this._configPath),
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

    static _parseConfig(config) {
        const parsedConfig = {};

        parsedConfig.development = _loadFromEnv('DEV_MODE', config.development, _typeCasts.bool);

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

        const redisConf = {};
        if (config.redis.sentinels || _definedInEnv('REDIS_SENTINELS')) {
            redisConf.name = _loadFromEnv('REDIS_NAME', config.redis.name);
            const sentinels = _loadFromEnv(
                'REDIS_SENTINELS',
                config.redis.sentinels,
                _typeCasts.list,
            );
            redisConf.sentinels = sentinels.map(v => {
                const [host, port] = v.split(':');
                return { host, port: Number.parseInt(port, 10) };
            });
            redisConf.sentinelPassword = _loadFromEnv(
                'REDIS_SENTINEL_PASSWORD',
                config.redis.sentinelPassword,
            );
        } else {
            redisConf.host = _loadFromEnv(
                'REDIS_HOST',
                config.redis.host,
            );
            redisConf.port = _loadFromEnv(
                'REDIS_PORT',
                config.redis.port,
                _typeCasts.int,
            );
            redisConf.password = _loadFromEnv(
                'REDIS_PASSWORD',
                config.redis.password,
            );
        }
        parsedConfig.redis = redisConf;

        const warp10Conf = {};
        warp10Conf.host = _loadFromEnv('WARP10_HOST', config.warp10.host);
        warp10Conf.port = _loadFromEnv('WARP10_PORT', config.warp10.port, _typeCasts.int);
        parsedConfig.warp10 = warp10Conf;

        parsedConfig.logging = {
            level: parsedConfig.development
                ? 'debug'
                : _loadFromEnv('LOG_LEVEL', config.log.logLevel),
            dumpLevel: _loadFromEnv(
                'LOG_DUMP_LEVEL',
                config.log.dumpLevel,
            ),
        };

        parsedConfig.cacheBackend = _loadFromEnv('CACHE_BACKEND', config.cacheBackend);

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

