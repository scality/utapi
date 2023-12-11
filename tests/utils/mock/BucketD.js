const http = require('http');

const express = require('express');

const { models, constants } = require('arsenal');

const { CANONICAL_ID, BUCKET_NAME, OBJECT_KEY } = require('./values');

const { ObjectMD } = models;
const { mpuBucketPrefix } = constants;

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
                value: JSON.stringify({
                    creationDate: new Date(),
                    name: `${BUCKET_NAME}-${i + 1}`,
                    owner: CANONICAL_ID,
                    ownerDisplayName: 'steve',
                }),
            };
            buckets.push(entry);
        }
        this._buckets = buckets;
        return this;
    }

    createBucketsWithOwner(buckets) {
        const { splitter } = constants;
        this._buckets = buckets.map(
            ({ name, owner }) => ({
                key: `${owner}${splitter}${name}`,
                value: JSON.stringify({
                    creationDate: new Date(),
                    name,
                    owner,
                    ownerDisplayName: 'steve',
                }),
            }),
        );
        return this._app;
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

    _getBucketVersionResponse(bucketName) {
        const body = {
            CommonPrefixes: [],
            IsTruncated: false,
            Versions: (this._bucketContent[bucketName] || [])
                // patch in a versionId to more closely match the real response
                .map(entry => ({ ...entry, versionId: 'null' })),
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
            } else if (req.query.listingType === 'DelimiterVersions') {
                req.body = this._getBucketVersionResponse(bucketName);
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
            const { splitter } = constants;
            const { bucketName } = req.params;
            let filterKey = bucketName;
            if (bucketName.indexOf(mpuBucketPrefix) !== -1) {
                filterKey = bucketName.replace(mpuBucketPrefix, '');
            }
            const bucket = this._buckets
                .reduce(
                    (prev, b) => (
                        b.key.split(splitter)[1] === filterKey
                            ? JSON.parse(b.value)
                            : prev),
                    null,
                );
            if (bucket) {
                res.status(200).send({
                    ...bucket,
                    name: bucketName,
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
        if (this._server !== null) {
            this._server.close();
        }
    }

    reset() {
        this._bucketCount = 0;
        this._bucketContent = {};
        this._buckets = [];
    }
}

module.exports = BucketD;
