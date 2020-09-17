const werelogs = require('werelogs');
const config = require('../../lib/Config');

const loggerConfig = {
    level: config.log.logLevel,
    dump: config.log.dumpLevel,
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

    with(extraDefaults) {
        return new LoggerContext({ ...this.defaults, ...extraDefaults });
    }

    info(msg, data = {}) {
        return rootLogger.info(msg, { ...this.defaults, ...data });
    }

    debug(msg, data = {}) {
        return rootLogger.debug(msg, { ...this.defaults, ...data });
    }

    trace(msg, data = {}) {
        return rootLogger.trace(msg, { ...this.defaults, ...data });
    }

    warn(msg, data = {}) {
        return rootLogger.warn(msg, { ...this.defaults, ...data });
    }

    error(msg, data = {}) {
        let _data = data;
        if (data && data.error) {
            _data = { ...data, errmsg: data.error.message, stack: data.error.stack };
        }
        return rootLogger.error(msg, { ...this.defaults, ..._data });
    }

    fatal(msg, data = {}) {
        return rootLogger.fatal(msg, { ...this.defaults, ...data });
    }

    async logAsyncError(func, msg, data = {}) {
        try {
            return await func();
        } catch (error) {
            this.error(msg, { error, ...data });
            throw error;
        }
    }
}

rootLogger.debug('logger initialized', { loggerConfig });

module.exports = {
    logger: rootLogger,
    LoggerContext,
};
