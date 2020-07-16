const Joi = require('@hapi/joi');

const redisServerSchema = Joi.object({
    name: Joi.string(),
    host: Joi.string(),
    port: Joi.number(),
    password: Joi.string(),
});

const redisSentinelSchema = Joi.object({
    name: Joi.string().default('jabba'),
    sentinels: Joi.array().items(Joi.string()),
    sentinelPassword: Joi.string().default('').allow(''),
});

const schema = Joi.object({
    host: Joi.string(),
    port: Joi.number().port(),
    workers: Joi.number(),
    development: Joi.boolean(),
    log: Joi.object({
        logLevel: Joi.alternatives()
            .try('error', 'warn', 'info', 'debug', 'trace'),
        dumpLevel: Joi.alternatives()
            .try('error', 'warn', 'info', 'debug', 'trace'),
    }),
    redis: Joi.alternatives().try(redisServerSchema, redisSentinelSchema),
    warp10: Joi.object({
        host: Joi.alternatives(Joi.string().hostname(), Joi.string().ip()),
        port: Joi.number().port(),
    }),
    healthChecks: Joi.object({
        allowFrom: Joi.array().items(Joi.string()),
    }),
    vaultd: Joi.object({
        host: Joi.string().hostname(),
        port: Joi.number().port(),
    }),
    expireMetrics: Joi.boolean(),
    expireMetricsTTL: Joi.number(),
    cacheBackend: Joi.string().valid('memory', 'redis'),
    nodeId: Joi.string(),
    ingestionSchedule: Joi.string(),
    checkpointSchedule: Joi.string(),
    snapshotSchedule: Joi.string(),
});

module.exports = schema;

