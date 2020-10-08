const { callbackify } = require('util');
const { Transform } = require('stream');
const uuid = require('uuid');
const needle = require('needle');
const aws4 = require('aws4');
const assert = require('assert');

// These modules are added via the `level-mem` package rather than individually
/* eslint-disable import/no-extraneous-dependencies */
const levelup = require('levelup');
const memdown = require('memdown');
const encode = require('encoding-down');
const { UtapiMetric } = require('../models');
const { LoggerContext, asyncOrCallback } = require('../utils');
/* eslint-enable import/no-extraneous-dependencies */

const moduleLogger = new LoggerContext({
    module: 'client',
});

class Chunker extends Transform {
    constructor(options) {
        super({ objectMode: true, ...options });
        this._chunkSize = (options && options.chunkSize) || 100;
        this._currentChunk = [];
    }

    _transform(chunk, encoding, callback) {
        this._currentChunk.push(chunk);
        if (this._currentChunk.length >= this._chunkSize) {
            this.push(this._currentChunk);
            this._currentChunk = [];
        }
        callback();
    }

    _flush(callback) {
        if (this._currentChunk.length) {
            this.push(this._currentChunk);
        }
        callback();
    }
}

class Uploader extends Transform {
    constructor(options) {
        super({ objectMode: true, ...options });
        this._ingest = options.ingest;
    }

    _transform(chunk, encoding, callback) {
        this._ingest(chunk.map(i => new UtapiMetric(i.value)))
            .then(() => {
                this.push({
                    success: true,
                    keys: chunk.map(i => i.key),
                });
                callback();
            },
            error => {
                this.push({
                    success: false,
                    keys: [],
                });
                moduleLogger.error('error uploading metrics from retry cache', { error });
                callback();
            });
    }
}

class UtapiClient {
    constructor(config) {
        this._host = (config && config.host) || 'localhost';
        this._port = (config && config.port) || '8100';
        this._logger = (config && config.logger) || moduleLogger;
        this._maxCachedMetrics = (config && config.maxCachedMetrics) || 200000; // roughly 100MB
        this._numCachedMetrics = 0;
        this._retryCache = levelup(encode(memdown(), { valueEncoding: 'json' }));
        this._drainTimer = null;
        this._drainCanSchedule = true;
        this._drainDelay = (config && config.drainDelay) || 30000;
    }

    async join() {
        await this._flushRetryCacheToLogs();
        this._retryCache.close();
    }

    async _pushToUtapi(metrics) {
        const resp = await needle(
            'post',
            `http://${this._host}:${this._port}/v2/ingest`,
            metrics.map(metric => metric.getValue()),
            { json: true },
        );
        if (resp.statusCode !== 200) {
            throw Error('failed to push metric, server returned non 200 status code',
                { respCode: resp.statusCode, respMessage: resp.statusMessage });
        }
    }

    async _addToRetryCache(metric) {
        if (this._numCachedMetrics < this._maxCachedMetrics) {
            try {
                await this._retryCache.put(metric.uuid, metric.getValue());
                this._numCachedMetrics += 1;
                await this._scheduleDrain();
                return true;
            } catch (error) {
                this._logger
                    .error('error adding metric to retry cache', { error });
                this._emitMetricLogLine(metric, { reason: 'error' });
            }
        } else {
            this._emitMetricLogLine(metric, { reason: 'overflow' });
        }
        return false;
    }

    async _drainRetryCache() {
        return new Promise((resolve, reject) => {
            let empty = true;
            const toRemove = [];

            this._retryCache.createReadStream()
                .pipe(new Chunker())
                .pipe(new Uploader({ ingest: this._pushToUtapi.bind(this) }))
                .on('data', res => {
                    if (res.success) {
                        toRemove.push(...res.keys);
                    } else {
                        empty = false;
                    }
                })
                .on('end', () => {
                    this._retryCache.batch(
                        toRemove.map(key => ({ type: 'del', key })),
                        error => {
                            if (error) {
                                this._logger.error('error removing events from retry cache', { error });
                                reject(error);
                                return;
                            }
                            resolve(empty);
                        },
                    );
                })
                .on('error', reject);
        });
    }

    async _drainRetryCachePreflight() {
        try {
            const resp = await needle(
                'get',
                `http://${this._host}:${this._port}/_/healthcheck`,
            );
            return resp.statusCode === 200;
        } catch (error) {
            this._logger
                .debug('drain preflight request failed', { error });
            return false;
        }
    }

    async _attemptDrain() {
        if (await this._drainRetryCachePreflight()) {
            let empty = false;

            try {
                empty = await this._drainRetryCache();
            } catch (error) {
                this._logger
                    .error('Error while draining cache', { error });
            }

            if (!empty) {
                await this._scheduleDrain();
            }
        }
        this._drainTimer = null;
    }

    async _scheduleDrain() {
        if (this._drainCanSchedule && !this._drainTimer) {
            this._drainTimer = setTimeout(this._attemptDrain.bind(this), this._drainDelay);
        }
    }

    async _disableDrain() {
        this._drainCanSchedule = false;
        if (this._drainTimer) {
            clearTimeout(this._drainTimer);
            this._drainTimer = null;
        }
    }

    _emitMetricLogLine(metric, extra) {
        this._logger.info('utapi metric recovery log', {
            event: metric.getValue(),
            utapiRecovery: true,
            ...(extra || {}),
        });
    }

    async _flushRetryCacheToLogs() {
        const toRemove = [];

        return new Promise((resolve, reject) => {
            this._retryCache.createReadStream()
                .on('data', entry => {
                    this._emitMetricLogLine(entry.value);
                    toRemove.push(entry.key);
                })
                .on('end', () => {
                    this._retryCache.batch(
                        toRemove.map(key => ({ type: 'del', key })),
                        error => {
                            if (error) {
                                this._logger.error('error removing events from retry cache', { error });
                                reject(error);
                                return;
                            }
                            resolve();
                        },
                    );
                })
                .on('error', err => reject(err));
        });
    }

    async _pushMetric(data) {
        const metric = data instanceof UtapiMetric
            ? data
            : new UtapiMetric(data);

        // Assign a uuid if one isn't passed
        if (!metric.uuid) {
            metric.uuid = uuid.v4();
        }

        // Assign a timestamp if one isn't passed
        if (!metric.timestamp) {
            metric.timestamp = new Date().getTime();
        }

        try {
            await this._pushToUtapi([metric]);
        } catch (error) {
            this._logger.error('unable to push metric, adding to retry cache', { error });
            if (!await this._addToRetryCache(metric)) {
                throw new Error('unable to store metric');
            }
        }
    }

    pushMetric(data, cb) {
        if (typeof cb === 'function') {
            callbackify(this._pushMetric.bind(this))(data, cb);
            return undefined;
        }
        return this._pushMetric(data);
    }

    /**
     *  Get the storageUtilized of a resource
     *
     * @param {string} level - level of metrics, currently only 'accounts' is supported
     * @param {string} resource - id of the resource
     * @param {Function|undefined} callback - optional callback
     * @returns {Promise|undefined} - return a Promise if no callback is provided, undefined otherwise
     */
    getStorage(level, resource, callback) {
        if (level !== 'accounts') {
            throw new Error('invalid level, only "accounts" is supported');
        }
        return asyncOrCallback(async () => {
            const resp = await needle(
                'get',
                `http://${this._host}:${this._port}/v2/storage/${level}/${resource}`,
            );

            if (resp.statusCode !== 200) {
                throw new Error(`unable to retrieve metrics: ${resp.statusMessage}`);
            }

            return resp.body;
        }, callback);
    }
}

module.exports = UtapiClient;
