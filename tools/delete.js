/* eslint-disable no-console */
const { clients } = require('./libV2/warp10');

const client = clients[0];

const secUSecs = 1000 * 1000;
const twoHourUSecs = secUSecs * 60 * 60 * 2;

async function getOldest() {
    const resp = await client.exec({
        macro: 'utapi/findOldestRecord',
        params: {
            class: '~.*',
            labels: {},
        },
    });

    if (!resp.result || resp.result.length !== 1) {
        console.log('failed to fetch oldest record timestamp. expiration failed');
        return null;
    }

    const oldestTimestamp = resp.result[0];
    if (oldestTimestamp === -1) {
        console.log('No records found, nothing to delete.');
        return null;
    }

    return oldestTimestamp;
}

async function doDelete(start) {
    const end = start + secUSecs - 1;
    const params = {
        className: '~.*',
        labels: {},
        start,
        end,
    };

    console.log(`delete ${start} - ${end} at ${(new Date()).toISOString()}`);
    try {
        const deleted = await client.delete(params);
        console.log(`deleted from gts ${JSON.stringify(deleted)}`);
        console.log('done, sleeping');
        // sleep for 5 secs
        setTimeout(() => doDelete(start + secUSecs), 5000);
    } catch (err) {
        console.log(err);
        console.log('Error during deletion retrying in 5 secs');
        setTimeout(() => doDelete(start), 5000);
    }
}

async function main() {
    const start = await getOldest();
    if (start === null) {
        setTimeout(main, 30000);
        return;
    }

    if (start >= (Date.now() * 1000) - twoHourUSecs) {
        console.log('Waiting for records to reach 2 hours old');
        setTimeout(main, 30000);
        return;
    }
    setImmediate(() => doDelete(start - 1));
}

main();
