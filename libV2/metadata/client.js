const BucketClientInterface = require('arsenal/lib/storage/metadata/bucketclient/BucketClientInterface');
const bucketclient = require('bucketclient');

const config = require('../config');
const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'metadata.client',
});

const params = {
    bucketdBootstrap: config.bucketd,
    https: config.https,
};

module.exports = new BucketClientInterface(params, bucketclient, moduleLogger);
