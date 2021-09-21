const assert = require('assert');
const { vault } = require('./client');
const metadata = require('../metadata');
const errors = require('../errors');

// Will be used for user keys
// eslint-disable-next-line no-unused-vars
async function translateResourceIds(level, resources, log) {
    if (level === 'accounts') {
        return vault.getCanonicalIds(resources, log);
    }

    return resources.map(resource => ({ resource, id: resource }));
}


async function authorizeAccountAccessKey(authInfo, level, resources, log) {
    let authed = false;
    let authedRes = [];

    switch (level) {
    // Account keys can only query metrics their own account metrics
    // So we can short circuit the auth to ->
    // Did they request their account? Then authorize ONLY their account
    case 'accounts':
        authed = resources.some(r => r === authInfo.getShortid());
        authedRes = authed ? [{ resource: authInfo.getShortid(), id: authInfo.getCanonicalID() }] : [];
        break;

    // Account keys are allowed access to any of their child users metrics
    case 'users': {
        let users;
        try {
            users = await vault.getUsersById(resources, log.logger);
        } catch (error) {
            log.error('failed to fetch user', { error });
            throw errors.AccessDenied;
        }
        authedRes = users
            .filter(user => user.parentId === authInfo.getShortid())
            .map(user => ({ resource: user.id, id: user.id }));
        authed = authedRes.length !== 0;
        break;
    }

    // Accounts are only allowed access if they are the owner of the bucket
    case 'buckets': {
        const buckets = await Promise.all(
            resources.map(async bucket => {
                try {
                    const bucketMD = await metadata.getBucket(bucket);
                    return bucketMD;
                } catch (error) {
                    log.error('failed to fetch metadata for bucket', { error, bucket });
                    throw errors.AccessDenied;
                }
            }),
        );

        authedRes = buckets
            .filter(bucket => bucket.getOwner() === authInfo.getCanonicalID())
            .map(bucket => ({ resource: bucket.getName(), id: bucket.getName() }));
        authed = authedRes.length !== 0;
        break;
    }

    // Accounts can not access service resources
    case 'services':
        break;

    default:
        log.error('Unknown metric level', { level });
        throw new Error(`Unknown metric level ${level}`);
    }

    return [authed, authedRes];
}

// stub function to handle user keys until implemented
async function authorizeUserAccessKey(authInfo, level, resources, authedRes, log) {
    const authorizedResources = authedRes.reduce(
        (authed, result) => {
            if (result.isAllowed) {
                // result.arn should be of format:
                // arn:scality:utapi:::resourcetype/resource
                assert(typeof result.arn === 'string');
                assert(result.arn.indexOf('/') > -1);
                const resource = result.arn.split('/')[1];
                authed.push(resource);
                log.trace('access granted for resource', { resource });
            }
            return authed;
        }, [],
    );

    return [authedRes.length !== 0, authorizedResources];
}

async function translateAndAuthorize(request, action, level, resources) {
    const {
        authed,
        authInfo,
        authedRes,
    } = await vault.authenticateRequest(request, action, level, resources);

    if (!authed) {
        return [false, []];
    }

    if (authInfo.isRequesterAnIAMUser()) {
        return authorizeUserAccessKey(authInfo, level, resources, authedRes, request.logger);
    }

    return authorizeAccountAccessKey(authInfo, level, resources, request.logger);
}

module.exports = {
    translateAndAuthorize,
    vault,
};
