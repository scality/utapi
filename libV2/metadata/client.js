const bucketclient = require('bucketclient');
const { BucketClientInterface } = require('arsenal').storage.metadata.bucketclient;

const config = require('../config');
const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'metadata.client',
});

const params = {
    bucketdBootstrap: config.bucketd,
    https: config.tls,
};

module.exports = new BucketClientInterface(params, bucketclient, moduleLogger);
