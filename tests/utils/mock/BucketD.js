const http = require('http');

const express = require('express');

const { models, constants } = require('arsenal');

const { CANONICAL_ID, BUCKET_NAME, OBJECT_KEY } = require('./values');

const { ObjectMD } = models;
const app = express();

class BucketD {
    constructor() {
        this._server = null;
        this._bucketCount = 0;
        this._bucketContent = {};
        this._buckets = [];
    }

    clearBuckets() {
        this._bucketContent = {};
        this._buckets = [];
        this._bucketCount = 0;
        return this;
    }

    setBucketCount(count) {
        this._bucketCount = count;
        return this;
    }

    setBucketContent({ bucketName, contentLength }) {
        const metadata = new ObjectMD()
            .setContentLength(contentLength)
            .getValue();
        this._bucketContent[bucketName] = [{
            key: OBJECT_KEY,
            value: JSON.stringify(metadata),
        }];
        return this;
    }

    createBuckets() {
        const buckets = [];
        for (let i = 0; i < this._bucketCount; i++) {
            const { splitter } = constants;
            const entry = {
                key: `${CANONICAL_ID}${splitter}${BUCKET_NAME}-${i + 1}`,
                value: JSON.stringify({ creationDate: new Date() }),
            };
            buckets.push(entry);
        }
        this._buckets = buckets;
        return this;
    }

    _getUsersBucketResponse(req) {
        const body = {
            CommonPrefixes: [],
        };
        const maxKeys = parseInt(req.query.maxKeys, 10);
        if (req.query.marker) {
            body.IsTruncated = false;
            body.Contents = this._buckets.slice(maxKeys);
        } else {
            body.IsTruncated = maxKeys < this._bucketCount;
            body.Contents = this._buckets.slice(0, maxKeys);
        }
        return JSON.stringify(body);
    }

    _getBucketResponse(bucketName) {
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Versions: this._bucketContent[bucketName] || [],
        };
        return JSON.stringify(body);
    }

    _initiateRoutes() {
        app.param('bucketName', (req, res, next, bucketName) => {
            if (bucketName === constants.usersBucket) {
                // eslint-disable-next-line no-param-reassign
                req.body = this._getUsersBucketResponse(req);
            } else {
                // eslint-disable-next-line no-param-reassign
                req.body = this._getBucketResponse(bucketName);
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
