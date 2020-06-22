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

const spec = _loadOpenApiSpec();
const apiOperations = _getApiOperationIds(spec.paths);

module.exports = {
    spec,
    apiOperations,
};
