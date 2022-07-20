const { vault } = require('./client');
const metadata = require('../metadata');
const errors = require('../errors');
const config = require('../config');

async function authorizeAccountAccessKey(authInfo, level, resources, log) {
    let authed = false;
    let authedRes = [];

    log.trace('Authorizing account', { resources });

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

async function authorizeUserAccessKey(authInfo, level, resources, log) {
    let authed = false;
    let authedRes = [];

    log.trace('Authorizing IAM user', { resources });

    // If no resources were authorized by Vault then no further checking is required
    if (resources.length === 0) {
        return [false, []];
    }

    // Get the parent account id from the user's arn
    const parentAccountId = authInfo.getArn().split(':')[4];

    // All users require an attached policy to query metrics
    // Additional filtering is performed here to limit access to the user's account
    switch (level) {
    // User keys can only query metrics their own account metrics
    // So we can short circuit the auth to ->
    // Did they request their account? Then authorize ONLY their account
    case 'accounts': {
        authed = resources.some(r => r === parentAccountId);
        authedRes = authed ? [{ resource: parentAccountId, id: authInfo.getCanonicalID() }] : [];
        break;
    }

    // Users can query other user's metrics if they are under the same account
    case 'users': {
        let users;
        try {
            users = await vault.getUsersById(resources, log.logger);
        } catch (error) {
            log.error('failed to fetch user', { error });
            throw errors.AccessDenied;
        }
        authedRes = users
            .filter(user => user.parentId === parentAccountId)
            .map(user => ({ resource: user.id, id: user.id }));
        authed = authedRes.length !== 0;
        break;
    }

    // Users can query bucket metrics if they are owned by the same account
    case 'buckets': {
        let buckets;
        try {
            buckets = await Promise.all(
                resources.map(bucket => metadata.getBucket(bucket)),
            );
        } catch (error) {
            log.error('failed to fetch metadata for bucket', { error });
            throw error;
        }
        authedRes = buckets
            .filter(bucket => bucket.getOwner() === authInfo.getCanonicalID())
            .map(bucket => ({ resource: bucket.getName(), id: bucket.getName() }));
        authed = authedRes.length !== 0;
        break;
    }

    case 'services':
        break;

    default:
        log.error('Unknown metric level', { level });
        throw new Error(`Unknown metric level ${level}`);
    }
    return [authed, authedRes];
}

async function authorizeServiceUser(authInfo, level, resources, log) {
    log.trace('Authorizing service user', { resources, arn: authInfo.getArn() });
    // The service user is allowed access to any resource so no checking is done
    if (level === 'accounts') {
        const canonicalIds = await vault.getCanonicalIds(resources, log.logger);
        return [canonicalIds.length !== 0, canonicalIds];
    }

    return [resources.length !== 0, resources.map(resource => ({ resource, id: resource }))];
}


async function translateAndAuthorize(request, action, level, resources) {
    const {
        authed,
        authInfo,
        authorizedResources,
    } = await vault.authenticateRequest(request, action, level, resources);

    if (!authed) {
        return [false, []];
    }

    if (config.serviceUser.enabled && authInfo.getArn() === config.serviceUser.arn) {
        return authorizeServiceUser(authInfo, level, authorizedResources, request.logger);
    }

    if (authInfo.isRequesterAnIAMUser()) {
        return authorizeUserAccessKey(authInfo, level, authorizedResources, request.logger);
    }

    return authorizeAccountAccessKey(authInfo, level, authorizedResources, request.logger);
}

module.exports = {
    translateAndAuthorize,
    vault,
};
