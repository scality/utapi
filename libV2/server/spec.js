const fs = require('fs');
const path = require('path');
const http = require('http');
const jsyaml = require('js-yaml');

const httpMethods = http.METHODS.map(i => i.toLowerCase());
const { LoggerContext } = require('../utils');

const moduleLogger = new LoggerContext({
    module: 'server.spec',
});

function _loadOpenApiSpec() {
    const spec = fs.readFileSync(path.join(__dirname, '../../openapi.yaml'), 'utf8');
    return jsyaml.safeLoad(spec);
}

function _getApiOperationIds(routes) {
    return Object.keys(routes)
        .reduce((optIds, path) => {
            httpMethods.forEach(method => {
                if (routes[path][method] !== undefined) {
                    const tag = routes[path][method]['x-router-controller'];
                    const optId = routes[path][method].operationId;
                    moduleLogger
                        .with({ method: '_getApiOperationIds' })
                        .trace('Registering handler', { tag, operationId: optId });
                    if (optIds[tag] === undefined) {
                        // eslint-disable-next-line no-param-reassign
                        optIds[tag] = new Set([optId]);
                    } else {
                        optIds[tag].add(optId);
                    }
                }
            });
            return optIds;
        }, {});
}

function _getApiOperationMiddleware(routes) {
    return Object.values(routes)
        .reduce((optIds, ops) => {
            Object.entries(ops)
                .filter(([method]) => httpMethods.includes(method))
                .forEach(([__, op]) => {
                    const middleware = {};

                    const tag = op['x-router-controller'];
                    if (optIds[tag] === undefined) {
                        optIds[tag] = {};
                    }

                    if (op['x-authv4'] === true) {
                        middleware.authv4 = true;
                    }
                    optIds[tag][op.operationId] = middleware;

                    moduleLogger
                        .with({ method: '_getApiOperationMiddleware' })
                        .trace('Registering middleware for handler', {
                            tag,
                            operationId: op.operationId,
                            middleware: Object.keys(middleware),
                        });
                });
            return optIds;
        }, {});
}

const spec = _loadOpenApiSpec();
const apiOperations = _getApiOperationIds(spec.paths);
const apiOperationMiddleware = _getApiOperationMiddleware(spec.paths);

module.exports = {
    spec,
    apiOperations,
    apiOperationMiddleware,
};
