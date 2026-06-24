const assert = require('assert');
const net = require('net');
const RedisClient = require('../../../libV2/redis');

describe('Test RedisClient', () => {
    let client;

    beforeEach(() => {
        client = new RedisClient({});
        client.connect();
    });

    afterEach(() => client.disconnect());

    it('should not raise exception if redis backend emits error without a listener', () => {
        client._redis.emit('error', new Error('OOPS'));
    });

    it('should be able to listen to redis backend errors', done => {
        client.on('error', () => done());
        client._redis.emit('error', new Error('OOPS'));
    });

    it('should not throw on a connect event after the client is disconnected', () => {
        // disconnect() sets _redis to null; a 'connect' that ioredis emits on a
        // later tick must not crash when _onConnect reaches for the socket.
        const disconnected = new RedisClient({});
        assert.doesNotThrow(() => disconnected._onConnect());
    });
});

describe('Test RedisClient socket errors', () => {
    let server;
    let client;
    let sockets;

    beforeEach(done => {
        // A bare TCP server gives the client a real socket we can drive.
        sockets = [];
        server = net.createServer(socket => sockets.push(socket));
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            client = new RedisClient({ host: '127.0.0.1', port });
            client.connect();
            client.once('connect', done);
        });
    });

    afterEach(done => {
        if (client && client._redis) {
            client._redis.disconnect();
        }
        sockets.forEach(socket => socket.destroy());
        server.close(done);
    });

    it('should not throw when the underlying socket emits more than one error', () => {
        const { stream } = client._redis;
        assert(stream, 'expected an underlying socket to be connected');
        // ioredis registers the socket 'error' handler with `once`, so the first
        // error consumes it. A second socket error -- e.g. an in-flight write
        // completing with EPIPE after a reset -- would otherwise be unhandled and
        // thrown as an uncaughtException.
        stream.emit('error', new Error('ECONNRESET'));
        stream.emit('error', new Error('EPIPE'));
    });
});
