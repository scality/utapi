const { EventEmitter } = require('events');
const os = require('os');
const { Command } = require('commander');
const { logger } = require('./utils');

class Process extends EventEmitter {
    constructor(...options) {
        super(...options);
        this._program = new Command();
    }

    async setup() {
        const cleanUpFunc = this.join.bind(this);
        ['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(eventName => {
            process.on(eventName, cleanUpFunc);
        });
        process.on('uncaughtException', error => {
            logger.error('uncaught exception',
                { error, stack: error.stack.split(os.EOL) });
            cleanUpFunc();
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
        await this._join();
    }

    /* eslint-disable class-methods-use-this,no-empty-function */
    async _setup() {}

    async _start() {}

    async _join() {}
    /* eslint-enable class-methods-use-this,no-empty-function */
}

module.exports = Process;
