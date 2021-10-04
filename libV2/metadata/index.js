/* eslint-disable no-restricted-syntax */
const arsenal = require('arsenal');

const metadata = require('./client');
const { LoggerContext, logger } = require('../utils');
const { keyVersionSplitter } = require('../constants');

const { usersBucket, splitter: mdKeySplitter, mpuBucketPrefix } = arsenal.constants;
const { BucketInfo } = arsenal.models;

const moduleLogger = new LoggerContext({
    module: 'metadata.client',
});

const PAGE_SIZE = 1000;

function _listingWrapper(bucket, params) {
    return new Promise(
        (resolve, reject) => metadata.listObject(
            bucket,
            params,
            logger.newRequestLogger(),
            (err, res) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(res);
            },
        ),
    );
}

function _listObject(bucket, prefix, hydrateFunc) {
    const listingParams = { prefix, maxKeys: PAGE_SIZE, listingType: 'Basic' };
    let gt;
    return {
        async* [Symbol.asyncIterator]() {
            while (true) {
                let res;

                try {
                    // eslint-disable-next-line no-await-in-loop
                    res = await _listingWrapper(bucket, { ...listingParams, gt });
                } catch (error) {
                    moduleLogger.error('Error during listing', { error });
                    throw error;
                }

                for (const item of res) {
                    yield hydrateFunc ? hydrateFunc(item) : item;
                }

                if (res.length !== PAGE_SIZE) {
                    break;
                }

                gt = res[res.length - 1].key;
            }
        },
    };
}

function listObjects(bucket) {
    return _listObject(bucket, '', data => {
        const { key, value } = data;
        const [name, version] = key.split(keyVersionSplitter);
        return {
            name,
            version,
            value: JSON.parse(value),
        };
    });
}

function listBuckets() {
    return _listObject(usersBucket, '', data => {
        const { key, value } = data;
        const [account, name] = key.split(mdKeySplitter);
        return {
            account,
            name,
            value: JSON.parse(value),
        };
    });
}

async function listMPUs(bucket) {
    const mpuBucket = `${mpuBucketPrefix}${bucket}`;
    return _listObject(mpuBucket, '', data => {
        const { key, value } = data;
        const [account, name] = key.split(mdKeySplitter);
        return {
            account,
            name,
            value: JSON.parse(value),
        };
    });
}

function bucketExists(bucket) {
    return new Promise((resolve, reject) => metadata.getBucketAttributes(
        bucket,
        logger.newRequestLogger(),
        err => {
            if (err && !err.NoSuchBucket) {
                reject(err);
                return;
            }
            resolve(err === null);
        },
    ));
}

function getBucket(bucket) {
    return new Promise((resolve, reject) => {
        metadata.getBucketAttributes(
            bucket,
            logger.newRequestLogger(), (err, data) => {
                console.log({ err, data });
                if (err) {
                    reject(err);
                    return;
                }
                resolve(BucketInfo.fromObj(data));
            },
        );
    });
}

module.exports = {
    listBuckets,
    listObjects,
    listMPUs,
    bucketExists,
    getBucket,
};
