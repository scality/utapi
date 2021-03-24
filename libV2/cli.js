const { Command } = require('commander');
const _config = require('./config');
const { comprehend } = require('./utils');
const { logger } = require('./utils');
const availableSubsystems = [
    'server',
    'ingest',
    'checkpoint',
    'snapshot',
    'repair',
    'reindex',
    'limit',
];

const enabledSubsystems = [];

const cli = new Command()
    .option('--server', 'Start a Utapi metrics server', () =>
        enabledSubsystems.push('server') && true)
    .option('--ingest', 'Start the ingest task', () =>
        enabledSubsystems.push('ingest') && true)
    .option(
        '--checkpoint',
        'Start the checkpoint task scheduler',
        () => enabledSubsystems.push('checkpoint') && true,
    )
    .option('--snapshot', 'Start the snapshot task scheduler', () =>
        enabledSubsystems.push('snapshot') && true)
    .option('--repair', 'Start the repair task scheduler', () =>
        enabledSubsystems.push('repair') && true)
    .option('--reindex', 'Start the reindex task scheduler', () =>
        enabledSubsystems.push('reindex') && true)
    .option(
        '--now',
        'Ignore configured schedules and execute specified background tasks immediately, exiting afterward.\n'
        + 'Can not be used with --server.',
    );

class UtapiCLI {
    static _parseSubsystems(config) {
        return availableSubsystems.filter(sys => config[sys]);
        // return comprehend(subsystems, (_, key) => ({
        //     key,
        //     value: !!config[key],
        // }));
    }

    static parse(argv) {
        const parsed = cli.parse(argv);

        if (parsed.now && enabledSubsystems.includes('server')) {
            throw new Error('--now can not be used with --server');
        }

        console.log(parsed)
        const cliConfig = {
            subsystems: UtapiCLI._parseSubsystems(parsed),
        };

        return _config.merge(cliConfig);
    }
}

module.exports = UtapiCLI;
