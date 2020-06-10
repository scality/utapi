const werelogs = require('werelogs');
const { config } = require('../config');

const loggerConfig = {
    level: config.logging.level,
    dump: config.logging.dumpLevel,
};

werelogs.configure(loggerConfig);

const rootLogger = new werelogs.Logger('Utapi');

class LoggerContext {
    constructor(defaults) {
        this._defaults = defaults;
    }

    get defaults() {
        return this._defaults || {};
    }

    from(extraDefaults) {
        return new LoggerContext({ ...this.defaults, extraDefaults });
    }

    info(msg, data) {
        return rootLogger.info(msg, { ...this.defaults, ...data });
    }

    debug(msg, data) {
        return rootLogger.debug(msg, { ...this.defaults, ...data });
    }

    trace(msg, data) {
        return rootLogger.trace(msg, { ...this.defaults, ...data });
    }

    warn(msg, data) {
        return rootLogger.warn((msg, { ...this.defaults, ...data });
    }

    error(msg, data) {
        return rootLogger.error(msg, { ...this.defaults, ...data });
    }

    fatal(msg, data) {
        return rootLogger.fatal(msg, { ...this.defaults, ...data });
    }
}


logger.debug('logger initialized', { loggerConfig });

function buildRequestLogger(req) {
    let reqUids = [];
    if (req.headers['x-scal-request-uids'] !== undefined) {
        reqUids.push(req.headers['x-scal-request-uids']);
    }

    // Remove any overly long request ids
    reqUids = reqUids.filter(id => id.length < 128);

    const reqLogger = logger.newRequestLogger(reqUids);

    const defaultInfo = {
        clientIP: req.ip,
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.originalUrl,
        endpoint: req.hostname,
    };

    reqLogger.addDefaultFields(defaultInfo);
    return reqLogger;
}

module.exports = {
    logger,
    buildRequestLogger,
    LoggerContext,
};
