const { EventEmitter } = require('events');

class SubSystem extends EventEmitter {
    constructor(config) {
        super();
        this._config = config;
    }

    async setup() {
        await this._setup(this._config);
    }

    async start() {
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

module.exports = SubSystem;
