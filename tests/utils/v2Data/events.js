const uuid = require('uuid');
const { UtapiMetric } = require('../../../libV2/models');

const { range, randChoice, randInt } = require('./rand');

const requiredFields = {
    uuid: () => uuid.v4(),
    account: params => params.account,
    location: params => params.location || 'ring',
};

const objOpFields = {
    user: params => params.user,
    bucket: params => params.bucket,
    object: params => params.object,
};

const eventTemplates = {
    get: {
        ...objOpFields,
        outgoingBytes: params => params.currentSize,
    },
    put: {
        ...objOpFields,
        incomingBytes: params => params.newSize,
        sizeDelta: params => {
            if (params.versioning) {
                return params.newSize;
            }
            return params.newSize - params.currentSize;
        },
        objectDelta: params => {
            if (params.versioning) {
                return 1;
            }
            return params.exists ? 0 : 1;
        },
    },
    delete: {
        ...objOpFields,
        sizeDelta: params => {
            if (params.versioning) {
                return 0;
            }
            return -1 * params.currentSize;
        },
        objectDelta: params => (params.versioning ? 0 : -1),
    },
    multidelete: {
        ...objOpFields,
        sizeDelta: params => {
            if (params.versioning) {
                return 0;
            }
            return -2 * params.currentSize;
        },
        objectDelta: params => (params.versioning ? 0 : -2),
        object: () => undefined,
    },
    md: {
        user: params => params.user,
    },

    bucket: {
        user: params => params.user,
        bucket: params => params.bucket,
    },
    obj: objOpFields,
};

const eventTemplateToOperation = {
    get: [
        'getObject',
    ],

    put: [
        'copyObject',
        'putData',
        'putObject',
        'uploadPart',
        'uploadPartCopy',
    ],

    delete: [
        'deleteObject',
    ],

    multidelete: [
        'multiObjectDelete',
    ],

    bucket: [
        'abortMultipartUpload',
        'completeMultipartUpload',
        'initiateMultipartUpload',
        'listMultipartUploadParts',
        'listMultipartUploads',
        'createBucket',
        'deleteBucket',
        'deleteBucketCors',
        'deleteBucketReplication',
        'deleteBucketWebsite',
        'getBucketAcl',
        'getBucketCors',
        'getBucketLocation',
        'getBucketObjectLock',
        'getBucketReplication',
        'getBucketVersioning',
        'getBucketWebsite',
        'headBucket',
        'listBucket',
        'putBucketAcl',
        'putBucketCors',
        'putBucketObjectLock',
        'putBucketReplication',
        'putBucketVersioning',
        'putBucketWebsite',
    ],

    obj: [
        'deleteObjectTagging',
        'getObjectAcl',
        'getObjectLegalHold',
        'getObjectRetention',
        'getObjectTagging',
        'headObject',
        'putDeleteMarkerObject',
        'putObjectAcl',
        'putObjectLegalHold',
        'putObjectRetention',
        'putObjectTagging',
    ],

};

const operationToEventTemplate = Object.entries(eventTemplateToOperation)
    .reduce((prev, [key, values]) => {
        values.forEach(v => {
            prev[v] = key;
        });
        return prev;
    }, {});

const allOperationIds = Object.values(eventTemplateToOperation)
    .reduce((prev, opIds) => {
        prev.push(...opIds);
        return prev;
    }, []);

function randOperationId(objectExists = true) {
    if (objectExists) {
        return randChoice(allOperationIds);
    }
    // Weight putting data more heavily so ops that require
    // the object to exist have a better chance of being used
    if (Math.random() < 0.75) {
        return randChoice(
            eventTemplateToOperation.put,
        );
    }
    return randChoice(
        eventTemplateToOperation.bucket,
    );
}


function makeEvent(timestamp, operationId, params) {
    const template = eventTemplates[[operationToEventTemplate[operationId]]];

    const metric = Object.entries({ ...requiredFields, ...template })
        .reduce((_metric, [key, factory]) => {
            _metric[key] = factory(params);
            // Explicitly remove keys that are undefined
            if (_metric[key] === undefined) {
                delete _metric[key];
            }
            return _metric;
        }, {});

    return { timestamp, operationId, ...metric };
}


function getRandAccountUserBucket(objects) {
    const account = randChoice(Object.keys(objects));
    const user = randChoice(Object.keys(objects[account]));
    const bucket = randChoice(Object.keys(objects[account][user]));
    return { account, user, bucket };
}

function getRandOrNewKey(existing) {
    if (existing.length === 0 || Math.random() < 0.1) {
        return [false, uuid.v4()];
    }
    return [true, randChoice(existing)];
}

const _emptyTotal = {
    bytes: 0,
    count: 0,
    in: 0,
    out: 0,
};

function updateTotal(total, event) {
    if (total === undefined) {
        total = { ..._emptyTotal };
        total.ops = {};
    }
    total.bytes += event.sizeDelta || 0;
    total.count += event.objectDelta || 0;
    total.in += event.incomingBytes || 0;
    total.out += event.outgoingBytes || 0;
    total.ops[event.operationId] = (total.ops[event.operationId] || 0) + 1;
    return total;
}

function generateCustomEvents(start, stop, count, accounts, versioning = true) {
    const duration = stop - start;
    const eventsEvery = duration / count;

    const objects = {};
    const totals = {
        accounts: {},
        users: {},
        buckets: {},
        total: undefined,
    };

    Object.entries(accounts).forEach(
        ([account, users]) => {
            objects[account] = {};
            Object.entries(users).forEach(
                ([user, buckets]) => {
                    objects[account][user] = {};
                    buckets.forEach(
                        bucket => { objects[account][user][bucket] = {}; },
                    );
                },
            );
        },
    );

    const events = range(count, eventsEvery)
        .map(i => Math.floor(start + i))
        .map(ts => {
            const { account, user, bucket } = getRandAccountUserBucket(objects);
            const [exists, object] = getRandOrNewKey(Object.keys(objects[account][user][bucket]));
            const objData = objects[account][user][bucket][object] || { size: 0, versions: 0 };

            const operationId = randOperationId(exists);

            const event = makeEvent(ts, operationId, {
                account,
                user,
                bucket,
                object,
                currentSize: objData.size,
                newSize: randInt(false),
                versioning,
                exists,
            });

            objData.size += event.sizeDelta || 0;
            objData.versions += event.objectDelta || 0;

            if (!versioning && operationToEventTemplate[operationId] === 'delete') {
                delete objects[account][user][bucket][object];
            } else if (!versioning && operationToEventTemplate[operationId] === 'multidelete') {
                const secondObject = randChoice(
                    Object.keys(objects[account][user][bucket])
                        .filter(o => o !== object),
                );
                delete objects[account][user][bucket][object];
                delete objects[account][user][bucket][secondObject];
            } else if (operationToEventTemplate[operationId] !== 'bucket') {
                objects[account][user][bucket][object] = objData;
            }


            totals.total = updateTotal(totals.total, event);
            totals.accounts[event.account] = updateTotal(totals.accounts[event.account], event);

            if (event.user) {
                totals.users[event.user] = updateTotal(totals.users[event.user], event);
            }

            if (event.bucket) {
                totals.buckets[event.bucket] = updateTotal(totals.buckets[event.bucket], event);
            }
            return new UtapiMetric(event);
        });

    return {
        events, objects, totals,
    };
}

function generateFakeEvents(start, stop, count) {
    return generateCustomEvents(start, stop, count, {
        [uuid.v4()]: { [uuid.v4()]: [uuid.v4()] },
    }).events;
}

module.exports = {
    generateFakeEvents,
    generateCustomEvents,
};
