const assert = require('assert');
const { scheduler } = require('timers/promises');
const sinon = require('sinon');
const flexiblePromisify = require('../../../../libV2/utils/flexiblePromisify');

describe('flexiblePromisify', () => {
    describe('Custom promisified functions', () => {
        it('should return custom promisified version when available', () => {
            const customPromisified = () => Promise.resolve('custom result');
            const originalFn = () => {};
            originalFn[Symbol.for('nodejs.util.promisify.custom')] = customPromisified;

            const result = flexiblePromisify(originalFn);

            assert.strictEqual(result, customPromisified);
        });

        it('should use custom promisified function even if original has callback signature', () => {
            const customPromisified = () => Promise.resolve('custom result');
            const originalFn = callback => callback(null, 'original result');
            originalFn[Symbol.for('nodejs.util.promisify.custom')] = customPromisified;

            const result = flexiblePromisify(originalFn);

            assert.strictEqual(result, customPromisified);
        });
    });

    describe('Promise-returning functions', () => {
        it('should handle functions that return resolved promises', async () => {
            const originalFn = () => Promise.resolve('promise result');
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified();

            assert.strictEqual(result, 'promise result');
        });

        it('should handle functions that return rejected promises', async () => {
            const error = new Error('promise error');
            const originalFn = () => Promise.reject(error);
            const promisified = flexiblePromisify(originalFn);

            await assert.rejects(promisified(), error);
        });

        it('should handle functions with arguments that return promises', async () => {
            const originalFn = (a, b) => Promise.resolve(a + b);
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified(5, 3);

            assert.strictEqual(result, 8);
        });

        it('should preserve this context for promise-returning functions', async () => {
            const obj = {
                value: 42,
                fn() {
                    return Promise.resolve(this.value);
                }
            };
            const promisified = flexiblePromisify(obj.fn);

            const result = await promisified.call(obj);

            assert.strictEqual(result, 42);
        });

        it('should ignore asynchronous callback when function returns a promise', async () => {
            const callbackSpy = sinon.spy();
            const originalFn = callback => {
                // Even though we have a callback parameter, we return a promise
                // The callback should be ignored
                setTimeout(() => {
                    callbackSpy();
                    callback(null, 'callback result');
                }, 10);
                return Promise.resolve('promise result');
            };
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified();

            assert.strictEqual(result, 'promise result');
            // Give callback time to potentially execute
            await scheduler.wait(20);
            assert.strictEqual(callbackSpy.callCount, 1); // Callback still executes but is ignored
        });

        it('should use synchronous callback result over returned promise', async () => {
            const originalFn = callback => {
                callback(null, 'callback result');
                return Promise.resolve('promise result');
            };
            const promisified = flexiblePromisify(originalFn);
    
            const result = await promisified();

            assert.strictEqual(result, 'callback result');
        });

        it('should handle functions that return thenable objects', async () => {
            const thenable = {
                then: resolve => {
                    setTimeout(() => resolve('thenable result'), 10);
                }
            };
            const originalFn = () => thenable;
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified();

            assert.strictEqual(result, 'thenable result');
        });

        it('should handle functions that return rejected thenable objects', async () => {
            const error = new Error('thenable error');
            const thenable = {
                then: (resolve, reject) => {
                    setTimeout(() => reject(error), 10);
                }
            };
            const originalFn = () => thenable;
            const promisified = flexiblePromisify(originalFn);

            await assert.rejects(promisified(), error);
        });
    });

    describe('Callback-style functions', () => {
        it('should handle successful callback functions', async () => {
            const originalFn = callback => {
                setTimeout(() => callback(null, 'callback result'), 10);
            };
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified();

            assert.strictEqual(result, 'callback result');
        });

        it('should handle callback functions with errors', async () => {
            const error = new Error('callback error');
            const originalFn = callback => {
                setTimeout(() => callback(error), 10);
            };
            const promisified = flexiblePromisify(originalFn);

            await assert.rejects(promisified(), error);
        });

        it('should handle callback functions with arguments', async () => {
            const originalFn = (a, b, callback) => {
                setTimeout(() => callback(null, a * b), 10);
            };
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified(4, 5);

            assert.strictEqual(result, 20);
        });

        it('should preserve this context for callback functions', async () => {
            const obj = {
                multiplier: 3,
                fn(value, callback) {
                    setTimeout(() => callback(null, value * this.multiplier), 10);
                }
            };
            const promisified = flexiblePromisify(obj.fn);

            const result = await promisified.call(obj, 7);

            assert.strictEqual(result, 21);
        });

        it('should handle synchronous callback functions', async () => {
            const originalFn = (value, callback) => {
                callback(null, value.toUpperCase());
            };
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified('hello');

            assert.strictEqual(result, 'HELLO');
        });

        it('should handle synchronous callback functions with errors', async () => {
            const error = new Error('sync error');
            const originalFn = callback => {
                callback(error);
            };
            const promisified = flexiblePromisify(originalFn);

            await assert.rejects(promisified(), error);
        });

        it('should handle functions that return non-thenable objects', async () => {
            const originalFn = callback => {
                callback(null, 'success');
                return { notAPromise: true };
            };
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified();

            assert.strictEqual(result, 'success');
        });

        it('should handle functions that throw synchronously', async () => {
            const error = new Error('sync throw');
            const originalFn = () => {
                throw error;
            };
            const promisified = flexiblePromisify(originalFn);

            await assert.rejects(promisified(), error);
        });

        it('should handle callback functions that call callback multiple times', async () => {
            const callbackSpy = sinon.spy();
            const originalFn = callback => {
                callbackSpy();
                callback(null, 'first call');
                setTimeout(() => {
                    callbackSpy();
                    callback(null, 'second call');
                }, 10);
            };
            const promisified = flexiblePromisify(originalFn);

            const result = await promisified();

            assert.strictEqual(result, 'first call');
            // Wait to see if second callback was called
            await scheduler.wait(20);
            assert.strictEqual(callbackSpy.callCount, 2);
        });
    });

    describe('Integration with Node.js util.promisify', () => {
        it('should work similarly to util.promisify for callback functions', async () => {
            const { promisify } = require('util');
            const originalFn = (value, callback) => {
                setTimeout(() => callback(null, value * 2), 10);
            };

            const utilPromisified = promisify(originalFn);
            const flexiblePromisified = flexiblePromisify(originalFn);

            const [utilResult, flexibleResult] = await Promise.all([
                utilPromisified(5),
                flexiblePromisified(5)
            ]);

            assert.strictEqual(utilResult, flexibleResult);
            assert.strictEqual(utilResult, 10);
        });

        it('should respect custom promisify symbol like util.promisify', () => {
            const { promisify } = require('util');
            const customPromisified = () => Promise.resolve('custom');
            const originalFn = () => {};
            originalFn[Symbol.for('nodejs.util.promisify.custom')] = customPromisified;

            const utilResult = promisify(originalFn);
            const flexibleResult = flexiblePromisify(originalFn);

            assert.strictEqual(utilResult, customPromisified);
            assert.strictEqual(flexibleResult, customPromisified);
        });
    });
});
