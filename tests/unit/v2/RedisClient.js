const RedisClient = require('../../../libV2/redis');

describe('Test RedisClient', () => {
    let client;

    beforeEach(() => {
        client = new RedisClient({});
        client.connect();
    });

    afterEach(() => client.disconnect());

    it('should not raise exception if redis backend emits error', () => {
        client._redis.emit('error', new Error('OOPS'));
    });

    it('should be able to listen to redis backend errors', done => {
        client.on('error', () => done());
        client._redis.emit('error', new Error('OOPS'));
    });
});
