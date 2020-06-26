async function healthcheck(ctx) {
    // eslint-disable-next-line no-param-reassign
    ctx.results.statusCode = 200;
}

module.exports = healthcheck;
