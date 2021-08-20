const assert = require('assert');
const async = require('async');
const Redis = require('ioredis');
const { EventEmitter } = require('events');
const { makeUtapiGenericClientRequest } = require('../../utils/utils');
const Vault = require('../../utils/mock/Vault');

const host = '127.0.0.1';
const sentinels = [
    { host, port: 16379 },
];

const redis = new Redis({
    port: 6379,
    host,
    sentinels,
    name: 'scality-s3',
});

const sentinel = new Redis({
    port: 16379,
    host,
});

const sentinelSub = new Redis({
    port: 16379,
    host,
});

describe.only('Client connections', async function test() {
    this.timeout(5000);
    this.loadgen = new EventEmitter();

    const makeRequest = (ctx, done) => {
        const MAX_RANGE_MS = (((1000 * 60) * 60) * 24) * 30; // One month.
        const {
            timeRange, type, resource, expected, action,
        } = {
            action: 'ListMetrics',
            type: 'buckets',
            resource: 'my-bucket',
            timeRange: [
                0,
                ((MAX_RANGE_MS / 60) - (1000 * 60) * 15) - 1,
            ],
            expected: {
                bucketName: 'my-bucket',
            },
        };

        const headers = {
            method: 'POST',
            path: `/${type}?Action=${action}`,
        };
        const body = {
            timeRange,
            [type]: [resource],
        };
        ctx.requestsDuringFailover += 1;
        makeUtapiGenericClientRequest(headers, body, (err, response) => {
            if (err) return done(err);
            const data = JSON.parse(response);
            if (data.code) {
                return new Error(data.message);
            }

            if (timeRange) {
                assert.deepStrictEqual(timeRange, data[0].timeRange);
            }

            Object.entries(expected).forEach(([k, v]) => {
                assert.strictEqual(data[0][k], v);
            });
        });
    };

    before(async () => {
        await sentinelSub.subscribe('+slave');

        this.connectionsBeforeFailover = null;
        this.connectionsAfterFailover = null;
        this.requestsDuringFailover = 0;
        this.vault = new Vault();
        this.vault.start();
    });

    after(async () => {
        this.vault.end();
        redis.disconnect();
        sentinel.disconnect();
        sentinelSub.disconnect();
    });

    beforeEach(async () => {
        const clients = await redis.client('list');
        this.connectionsBeforeFailover = clients.split('\n').length;
        this.requestsDuringFailover = 0;
    });

    afterEach(async () => {
        const clients = await redis.client('list');
        this.connectionsAfterFailover = clients.split('\n').length;
        assert(this.connectionsAfterFailover <= this.connectionsBeforeFailover);
    });

    it('should not add connections after failover under load', done => {
        sentinel.sentinel('failover', 'scality-s3', (err, res) => {
            if (err) return done(err);
            async.race([
                () => setTimeout(() => this.loadgen.emit('finished'), 3000),
                () => async.times(
                    100,
                    () => makeRequest(this, done),
                    () => this.loadgen.emit('finished'),
                ),
            ]);

            assert.strictEqual(res, 'OK');
        });

        sentinelSub.on('message', (chan, message) => {
            // wait until the old master is added as a replica so any stale connections would be transfered
            assert.strictEqual(chan, '+slave');
            // checks that ports differ between old and new master
            const data = message.split(' ');
            const [oldPort, newPort] = [data[3], data[7]];
            assert.notStrictEqual(oldPort, newPort);

            return this.loadgen.on('finished', () => {
                assert(this.requestsDuringFailover > 1);
                return done();
            });
        });
    }).timeout(20000);
});
