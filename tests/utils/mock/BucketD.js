const http = require('http');

const express = require('express');

const { models, constants } = require('arsenal');

const { CANONICAL_ID, BUCKET_NAME, OBJECT_KEY } = require('./values');

const { ObjectMD } = models;
const app = express();

class BucketD {
    constructor() {
        this._server = null;
    }

    _getUsersBucketResponse() {
        const key = `${CANONICAL_ID}${constants.splitter}${BUCKET_NAME}`;
        const value = JSON.stringify({ creationDate: new Date() });
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Contents: [{ key, value }],
        };
        return JSON.stringify(body);
    }

    _getBucketResponse() {
        const key = OBJECT_KEY;
        const metadata = new ObjectMD().setContentLength(1024).getValue();
        const value = JSON.stringify(metadata);
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Versions: [{ key, value }],
        };
        return JSON.stringify(body);
    }

    _initiateRoutes() {
        app.param('bucketName', (req, res, next, bucketName) => {
            if (bucketName === constants.usersBucket) {
                req.body = this._getUsersBucketResponse();
            } else {
                req.body = this._getBucketResponse();
            }
            next();
        });

        app.get('/default/bucket/:bucketName', (req, res) => {
            res.writeHead(200);
            res.write(req.body);
            res.end();
        });
    }

    start() {
        this._initiateRoutes();
        const port = 9000;
        this._server = http.createServer(app).listen(port);
    }

    end() {
        this._server.close();
    }
}

module.exports = BucketD;
