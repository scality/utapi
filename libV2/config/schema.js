const Joi = require('@hapi/joi');

const redisServerSchema = Joi.object({
    host: Joi.string(),
    port: Joi.number(),
    password: Joi.string().allow(''),
});

const redisSentinelSchema = Joi.object({
    name: Joi.string().default('utapi'),
    sentinels: Joi.array().items(Joi.object({
        host: Joi.alternatives(Joi.string().hostname(), Joi.string().ip()),
        port: Joi.number().port(),
    })),
    password: Joi.string().default('').allow(''),
    sentinelPassword: Joi.string().default('').allow(''),
});

const warp10SingleHost = Joi.object({
    host: Joi.alternatives(Joi.string().hostname(), Joi.string().ip()),
    port: Joi.number().port(),
    readToken: Joi.string(),
    writeToken: Joi.string(),
});

const warp10MultiHost = Joi.object({
    hosts: Joi.array().items(Joi.object({
        host: Joi.alternatives(Joi.string().hostname(), Joi.string().ip()),
        port: Joi.number().port(),
    })),
    readToken: Joi.string(),
    writeToken: Joi.string(),
});


const tlsSchema = Joi.object({
    key: Joi.string(),
    cert: Joi.string(),
    ca: Joi.string(),
});

const schema = Joi.object({
    host: Joi.string(),
    port: Joi.number().port(),
    certFilePaths: tlsSchema.default({}),
    workers: Joi.number(),
    development: Joi.boolean(),
    log: Joi.object({
        logLevel: Joi.alternatives()
            .try('error', 'warn', 'info', 'debug', 'trace'),
        dumpLevel: Joi.alternatives()
            .try('error', 'warn', 'info', 'debug', 'trace'),
    }),
    redis: Joi.alternatives().try(redisServerSchema, redisSentinelSchema),
    localCache: Joi.alternatives().try(redisServerSchema, redisSentinelSchema),
    warp10: Joi.alternatives().try(warp10SingleHost, warp10MultiHost),
    healthChecks: Joi.object({
        allowFrom: Joi.array().items(Joi.string()),
    }),
    vaultd: Joi.object({
        host: Joi.string().hostname(),
        port: Joi.number().port(),
    }),
    reindex: Joi.object({
        enabled: Joi.boolean(),
        schedule: Joi.string(),
    }),
    bucketd: Joi.array().items(Joi.string()),
    expireMetrics: Joi.boolean(),
    expireMetricsTTL: Joi.number(),
    cacheBackend: Joi.string().valid('memory', 'redis'),
    nodeId: Joi.string(),
    ingestionSchedule: Joi.string(),
    ingestionShardSize: Joi.number().greater(0),
    ingestionLagSeconds: Joi.number().greater(0),
    checkpointSchedule: Joi.string(),
    snapshotSchedule: Joi.string(),
    repairSchedule: Joi.string(),
    reindexSchedule: Joi.string(),
    diskUsageSchedule: Joi.string(),
    diskUsage: Joi.object({
        path: Joi.string(),
        mode: Joi.alternatives().try('local', 'distributed'),
        softLimit: Joi.string(),
        expirationBlockSize: Joi.number(),
        hardLimit: Joi.string(),
    }),
});

module.exports = schema;

