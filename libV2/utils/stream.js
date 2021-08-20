/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */
/* eslint-disable no-await-in-loop */

const { jsutil } = require('arsenal');

async function* streamToAsyncIter(stream) {
    let finished = false;
    let data;

    stream.on('end', () => { finished = true; });
    stream.pause();
    while (!finished) {
        data = await new Promise((resolve, reject) => {
            const _resolve = jsutil.once(resolve);
            const _reject = jsutil.once(reject);
            const end = () => _resolve([]);
            stream.once('end', end);
            stream.once('error', _reject);
            stream.once('data', _data => {
                stream.pause();
                stream.off('end', end);
                stream.off('error', _reject);
                _resolve(_data);
            });
            stream.resume();
        });

        for (const item of data) {
            yield item;
        }
    }
}


module.exports = {
    streamToAsyncIter,
};
