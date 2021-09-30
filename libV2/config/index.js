const fs = require('fs');
const path = require('path');
const Joi = require('@hapi/joi');
const assert = require('assert');

const {
    truthy, envNamespace, allowedFilterFields, allowedFilterStates,
} = require('../constants');
const configSchema = require('./schema');
// We need to require the specific file rather than the parent module to avoid a circular require
const { parseDiskSizeSpec } = require('../utils/disk');

function _splitTrim(char, text) {
    return text.split(char).map(v => v.trim());
}

function _splitServer(text) {
    assert.notStrictEqual(text.indexOf(':'), -1);
    const [host, port] = _splitTrim(':', text);
    return {
        host,
        port: Number.parseInt(port, 10),
    };
}

function _splitNode(text) {
    assert.notStrictEqual(text.indexOf('='), -1);
    const [nodeId, hostname] = _splitTrim('=', text);
    return {
        nodeId,
        ..._splitServer(hostname),
    };
}

const _typeCasts = {
    bool: val => truthy.has(val.toLowerCase()),
    int: val => parseInt(val, 10),
    list: val => _splitTrim(',', val),
    serverList: val => _splitTrim(',', val).map(_splitServer),
    nodeList: val => _splitTrim(',', val).map(_splitNode),
    diskSize: parseDiskSizeSpec,
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

    static _parseRedisConfig(prefix, config) {
        const redisConf = {
            retry: config.retry,
        };
        if (config.sentinels || _definedInEnv(`${prefix}_SENTINELS`)) {
            redisConf.name = _loadFromEnv(`${prefix}_NAME`, config.name);
            redisConf.sentinels = _loadFromEnv(
                `${prefix}_SENTINELS`,
                config.sentinels,
                _typeCasts.serverList,
            );
            redisConf.sentinelPassword = _loadFromEnv(
                `${prefix}_SENTINEL_PASSWORD`,
                config.sentinelPassword,
            );
        } else {
            redisConf.host = _loadFromEnv(
                `${prefix}_HOST`,
                config.host,
            );
            redisConf.port = _loadFromEnv(
                `${prefix}_PORT`,
                config.port,
                _typeCasts.int,
            );
            redisConf.password = _loadFromEnv(
                `${prefix}_PASSWORD`,
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

    static _parseResourceFilters(config) {
        const resourceFilters = {};

        allowedFilterFields.forEach(
            field => allowedFilterStates.forEach(
                state => {
                    const configResources = (config[state] && config[state][field]) || null;
                    const envVar = `FILTER_${field.toUpperCase()}_${state.toUpperCase()}`;
                    const resources = _loadFromEnv(envVar, configResources, _typeCasts.list);
                    if (resources) {
                        if (resourceFilters[field]) {
                            throw new Error('You can not define both an allow and a deny list for an event field.');
                        }
                        resourceFilters[field] = { [state]: new Set(resources) };
                    }
                },
            ),
        );

        return resourceFilters;
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

        parsedConfig.redis = Config._parseRedisConfig('REDIS', config.redis);

        parsedConfig.cache = Config._parseRedisConfig('REDIS_CACHE', config.localCache);
        parsedConfig.cache.backend = _loadFromEnv('CACHE_BACKEND', config.cacheBackend);

        const warp10Conf = {
            readToken: _loadFromEnv('WARP10_READ_TOKEN', config.warp10.readToken),
            writeToken: _loadFromEnv('WARP10_WRITE_TOKEN', config.warp10.writeToken),
        };

        if (Array.isArray(config.warp10.hosts) || _definedInEnv('WARP10_HOSTS')) {
            warp10Conf.hosts = _loadFromEnv('WARP10_HOSTS', config.warp10.hosts, _typeCasts.nodeList);
        } else {
            warp10Conf.hosts = [{
                host: _loadFromEnv('WARP10_HOST', config.warp10.host),
                port: _loadFromEnv('WARP10_PORT', config.warp10.port, _typeCasts.int),
                nodeId: _loadFromEnv('WARP10_NODE_ID', config.warp10.nodeId),
            }];
        }

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

        parsedConfig.ingestionSchedule = _loadFromEnv('INGESTION_SCHEDULE', config.ingestionSchedule);
        parsedConfig.checkpointSchedule = _loadFromEnv('CHECKPOINT_SCHEDULE', config.checkpointSchedule);
        parsedConfig.snapshotSchedule = _loadFromEnv('SNAPSHOT_SCHEDULE', config.snapshotSchedule);
        parsedConfig.repairSchedule = _loadFromEnv('REPAIR_SCHEDULE', config.repairSchedule);
        parsedConfig.reindexSchedule = _loadFromEnv('REINDEX_SCHEDULE', config.reindexSchedule);
        parsedConfig.diskUsageSchedule = _loadFromEnv('DISK_USAGE_SCHEDULE', config.diskUsageSchedule);

        parsedConfig.ingestionLagSeconds = _loadFromEnv(
            'INGESTION_LAG_SECONDS',
            config.ingestionLagSeconds,
            _typeCasts.int,
        );
        parsedConfig.ingestionShardSize = _loadFromEnv(
            'INGESTION_SHARD_SIZE',
            config.ingestionShardSize,
            _typeCasts.int,
        );

        const diskUsage = {
            path: _loadFromEnv('DISK_USAGE_PATH', (config.diskUsage || {}).path),
            hardLimit: _loadFromEnv('DISK_USAGE_HARD_LIMIT', (config.diskUsage || {}).hardLimit),
            retentionDays: _loadFromEnv(
                'METRIC_RETENTION_PERIOD',
                (config.diskUsage || {}).retentionDays, _typeCasts.int,
            ),
            expirationEnabled: _loadFromEnv(
                'METRIC_EXPIRATION_ENABLED',
                (config.diskUsage || {}).expirationEnabled, _typeCasts.bool,
            ),
        };

        if (diskUsage.hardLimit !== undefined) {
            diskUsage.hardLimit = parseDiskSizeSpec(diskUsage.hardLimit);
        }

        if (!diskUsage.path && diskUsage.hardLimit !== undefined) {
            throw Error('You must specify diskUsage.path to monitor for disk usage');
        } else if (diskUsage.path && diskUsage.hardLimit === undefined) {
            throw Error('diskUsage.hardLimit must be specified');
        } else if (diskUsage.expirationEnabled && diskUsage.retentionDays === undefined) {
            throw Error('diskUsage.retentionDays must be specified');
        }

        diskUsage.enabled = diskUsage.path !== undefined;
        parsedConfig.diskUsage = diskUsage;

        parsedConfig.vaultd = {
            host: _loadFromEnv('VAULT_HOST', config.vaultd.host),
            port: _loadFromEnv('VAULT_PORT', config.vaultd.port),
        };

        parsedConfig.bucketd = _loadFromEnv('BUCKETD_BOOTSTRAP', config.bucketd, _typeCasts.serverList);

        parsedConfig.serviceUser = {
            arnPrefix: _loadFromEnv('SERVICE_USER_ARN_PREFIX', config.serviceUser.arnPrefix),
            enabled: _loadFromEnv('SERVICE_USER_ENABLED', config.serviceUser.enabled, _typeCasts.bool),
        };

        parsedConfig.filter = Config._parseResourceFilters(config.filter);

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
