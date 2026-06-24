const { EventEmitter } = require('events');
const os = require('os');
const { Command } = require('commander');
const { logger } = require('./utils');

class Process extends EventEmitter {
    constructor(...options) {
        super(...options);
        this._program = null;
    }

    async setup() {
        const cleanUpFunc = this.join.bind(this);
        ['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(eventName => {
            process.on(eventName, cleanUpFunc);
        });
        let shuttingDown = false;
        process.on('uncaughtException', async error => {
            logger.error('uncaught exception',
                { error, stack: error.stack.split(os.EOL) });
            // Clean up once, then exit. Without the guard a failure inside _join
            // (e.g. closing an already-dropped redis connection) raises another
            // uncaughtException and re-enters here, looping indefinitely. Exiting
            // lets the supervisor restart us instead of spinning.
            if (shuttingDown) {
                return;
            }
            shuttingDown = true;
            try {
                await cleanUpFunc();
            } catch (cleanupError) {
                logger.error('error during cleanup after uncaught exception',
                    { error: cleanupError });
            }
            process.exit(1);
        });
        this._program = new Command();
        await this._setup();
    }

    async start() {
        this._program.parse(process.argv);
        await this._start();
    }

    async join() {
        this.emit('exit');
        try {
            await this._join();
        } finally {
            ['SIGINT', 'SIGQUIT', 'SIGTERM', 'uncaughtException'].forEach(eventName => {
                process.removeAllListeners(eventName);
            });
        }
    }

    async _setup() {}

    async _start() {}

    async _join() {}
}

module.exports = Process;
