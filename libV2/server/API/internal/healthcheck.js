async function healthcheck(ctx) {
    ctx.results.statusCode = 200;
}

module.exports = healthcheck;
