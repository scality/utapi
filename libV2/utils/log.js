const werelogs = require('werelogs');
const config = require('../config');

const loggerConfig = {
    level: config.logging.level,
    dump: config.logging.dumpLevel,
};

werelogs.configure(loggerConfig);

const rootLogger = new werelogs.Logger('Utapi');

class LoggerContext {
    constructor(defaults, logger = null) {
        this._defaults = defaults;
        this.logger = logger !== null ? logger : rootLogger;
    }

    get defaults() {
        return this._defaults || {};
    }

    static expandError(data) {
        if (data && data.error) {
            return { ...data, errmsg: data.error.message, stack: data.error.stack };
        }
        return data;
    }

    _collectData(data) {
        return { ...this.defaults, ...LoggerContext.expandError(data) };
    }

    with(extraDefaults) {
        return new LoggerContext({ ...this.defaults, ...extraDefaults }, this.logger);
    }

    withLogger(logger) {
        return new LoggerContext({ ...this.defaults }, logger);
    }

    info(msg, data = {}) {
        return this.logger.info(msg, this._collectData(data));
    }

    debug(msg, data = {}) {
        return this.logger.debug(msg, this._collectData(data));
    }

    trace(msg, data = {}) {
        return this.logger.trace(msg, this._collectData(data));
    }

    warn(msg, data = {}) {
        return this.logger.warn(msg, this._collectData(data));
    }

    error(msg, data = {}) {
        return this.logger.error(msg, this._collectData(data));
    }

    fatal(msg, data = {}) {
        return this.logger.fatal(msg, this._collectData(data));
    }

    end(msg, data = {}) {
        return this.logger.end(msg, this._collectData(data));
    }

    async logAsyncError(func, msg, data = {}) {
        try {
            return await func();
        } catch (error) {
            this.error(msg, { ...data, error });
            throw error;
        }
    }
}

rootLogger.debug('logger initialized', { loggerConfig });

function buildRequestLogger(req) {
    let reqUids = [];
    if (req.headers['x-scal-request-uids'] !== undefined) {
        reqUids.push(req.headers['x-scal-request-uids']);
    }

    // Truncate any overly long request ids
    reqUids = reqUids.map(id => id.slice(0, 128));

    const reqLogger = rootLogger.newRequestLogger(reqUids);

    const defaultInfo = {
        clientIP: req.ip,
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.originalUrl,
        endpoint: req.hostname,
    };

    reqLogger.addDefaultFields(defaultInfo);
    return new LoggerContext({}, reqLogger);
}

module.exports = {
    logger: rootLogger,
    buildRequestLogger,
    LoggerContext,
};
