
const { ProbeServer } = require('arsenal').network.probe.ProbeServer;

/**
 * Configure probe servers
 * @typedef {Object} ProbeServerConfig
 * @property {string} bindAddress - Address to bind probe server to
 * @property {number} port - Port to bind probe server to
 */

/**
 * Start an empty probe server
 * @async
 * @param {ProbeServerConfig} config - Configuration for probe server
 * @returns {Promise<ProbeServer>} - Instance of ProbeServer
 */
async function startProbeServer(config) {
    if (!config) {
        throw new Error('configuration for probe server is missing');
    }

    return new Promise((resolve, reject) => {
        const probeServer = new ProbeServer(config);
        probeServer.onListening(() => resolve(probeServer));
        probeServer.onError(err => reject(err));
        probeServer.start();
    });
}

module.exports = {
    startProbeServer,
};
