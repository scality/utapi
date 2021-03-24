const { EventEmitter } = require('events');
const os = require('os');
const async = require('async');
const { logger, comprehend } = require('./utils');
const UtapiCLI = require('./cli');
const { UtapiServer } = require('./server');
const {
    IngestShard,
    CreateCheckpoint,
    CreateSnapshot,
    RepairTask,
    ReindexTask,
    MonitorDiskUsage,
} = require('./tasks');

const subsystems = {
    server: UtapiServer,
    ingest: IngestShard,
    checkpoint: CreateCheckpoint,
    snapshot: CreateSnapshot,
    repair: RepairTask,
    reindex: ReindexTask,
    limit: MonitorDiskUsage,
    // TODO split expiration into separate task
    // expiration:
};

class Process extends EventEmitter {
    constructor() {
        super();
        this._config = null;
        this._subsystems = null;
    }

    _registerSignalHandlers() {
        const cleanUpFunc = this.join.bind(this, 1);
        ['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(eventName => {
            process.on(eventName, cleanUpFunc);
        });
        process.on('uncaughtException', error => {
            logger.error('uncaught exception',
                { error, stack: error.stack.split(os.EOL) });
            cleanUpFunc();
        });
    }

    async setup() {
        this._registerSignalHandlers();
        try {
            this._config = UtapiCLI.parse(process.argv);
        } catch(error) {
            console.log(error.message);
            return false;
        }
        // console.log(this._config)
        this._subsystems = await Process._setupSubSystems(this._config);
        return true;
    }

    static async _setupSubSystems(config) {
        return async.reduce(config.subsystems, {},
        // const systems = comprehend(
        //     config.subsystems,
            async (systems, key) => {
                const sys = new subsystems[key](config);
                await sys.setup();
                systems[key] = sys;
                return systems;
            },
        );
    }

    async start() {
        if (!this._subsystems) {
            throw new Error('The process must be setup before starting!');
        }
        // console.log(this._subsystems)
        await Promise.all(
            Object.entries(this._subsystems).map(async ([name, sys]) => {
                try {
                    await sys.start();
                } catch (error) {
                    const msg = `Error starting subsystem ${name}`;
                    logger.error(msg, { error });
                    throw new Error(msg);
                }
            }),
        );
    }

    async join(returnCode = 0) {
        this.emit('exit');
        console.log('-'.repeat(50))
        if (this._subsystems) {
            const results = await Promise.all(
                Object.entries(this._subsystems).map(async ([name, sys]) => {
                    try {
                        await sys.join();
                    } catch (error) {
                        logger.error(`Error stopping subsystem ${name}`, { error });
                        return name;
                    }
                    return null;
                }),
            );

            const errors = results.filter(e => e !== null);
            if (errors.length) {
                logger.error(`Error stopping subsystems: ${errors.join(', ')}`, { subsystems: errors });
                process.exit(1);
            }
        }

        process.exit(returnCode);
    }
}


module.exports = Process;
