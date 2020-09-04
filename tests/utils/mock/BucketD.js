const http = require('http');

const express = require('express');

const { models, constants } = require('arsenal');

const { CANONICAL_ID, BUCKET_NAME, OBJECT_KEY } = require('./values');

const { ObjectMD } = models;

class BucketD {
    constructor(isV2 = false) {
        this._server = null;
        this._bucketCount = 0;
        this._bucketContent = {};
        this._buckets = [];
        this._isV2 = isV2;
        this._app = express();
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
        this._bucketContent[bucketName] = [
            {
                key: OBJECT_KEY,
                value: JSON.stringify(metadata),
            },
        ];
        return this;
    }

    createBuckets() {
        const buckets = [];
        for (let i = 0; i < this._bucketCount; i += 1) {
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
        if (req.query.marker || req.query.gt) {
            body.IsTruncated = false;
            body.Contents = this._buckets.slice(maxKeys);
        } else {
            body.IsTruncated = maxKeys < this._bucketCount;
            body.Contents = this._buckets.slice(0, maxKeys);
        }
        return body;
    }

    _getShadowBucketResponse(bucketName) {
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Contents: this._bucketContent[bucketName] || [],
        };
        return body;
    }

    _getBucketResponse(bucketName) {
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Contents: this._bucketContent[bucketName] || [],
        };
        return body;
    }

    _getShadowBucketOverviewResponse(bucketName) {
        const mpus = (this._bucketContent[bucketName] || []).map(o => ({
            key: o.key,
            value: { UploadId: '123456' },
        }));
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Uploads: mpus,
        };
        return body;
    }

    _initiateRoutes() {
        this._app.param('bucketName', (req, res, next, bucketName) => {
            /* eslint-disable no-param-reassign */
            if (bucketName === constants.usersBucket) {
                req.body = this._getUsersBucketResponse(req);
            } else if (req.query.listingType === 'MPU') {
                req.body = this._getShadowBucketOverviewResponse(bucketName);
            } else if (
                req.query.listingType === 'Basic'
                || req.query.listingType === 'Delimiter'
            ) {
                req.body = this._getBucketResponse(bucketName);
            }

            // v2 reindex uses `Basic` listing type for everything
            if (this._isV2) {
                if (req.body && req.body.Contents) {
                    req.body = req.body.Contents;
                }
            }

            /* eslint-enable no-param-reassign */
            next();
        });

        this._app.get('/default/attributes/:bucketName', (req, res) => {
            const key = req.params.bucketName;
            const bucket = this._bucketContent[key];
            if (bucket) {
                res.status(200).send({
                    name: key,
                    owner: CANONICAL_ID,
                    ownerDisplayName: 'steve',
                    creationDate: new Date(),
                });
                return;
            }
            res.statusMessage = 'DBNotFound';
            res.status(404).end();
        });


        this._app.get('/default/bucket/:bucketName', (req, res) => {
            res.status(200).send(req.body);
        });
    }

    start() {
        this._initiateRoutes();
        const port = 9000;
        this._server = http.createServer(this._app).listen(port);
    }

    end() {
        this._server.close();
    }

    reset() {
        this._bucketCount = 0;
        this._bucketContent = {};
        this._buckets = [];
    }
}

module.exports = BucketD;
