const http = require('http');

const express = require('express');

const { models, constants } = require('arsenal');

const { CANONICAL_ID, BUCKET_NAME, OBJECT_KEY } = require('./values');

const { ObjectMD } = models;
const app = express();

app.param('bucketName', (req, res, next, bucketName) => {
    let metadata;
    if (bucketName === constants.usersBucket) {
        metadata = {
            key: `${CANONICAL_ID}${constants.splitter}${BUCKET_NAME}`,
            value: JSON.stringify({ creationDate: new Date() }),
        };
    } else {
        const value = new ObjectMD().setContentLength(1024).getValue();
        metadata = {
            key: OBJECT_KEY,
            value: JSON.stringify(value),
        };
    }
    const body = {
        CommonPrefixes: [],
        Contents: [metadata],
        IsTruncated: false,
    };
    req.body = JSON.stringify(body); // eslint-disable-line
    next();
});

app.get('/default/bucket/:bucketName', (req, res) => {
    res.writeHead(200);
    res.write(req.body);
    res.end();
});

class BucketD {
    constructor() {
        this._server = null;
    }

    start() {
        const port = 9000;
        this._server = http.createServer(app).listen(port);
    }

    end() {
        this._server.close();
    }
}

module.exports = BucketD;
