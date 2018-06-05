#!/bin/bash

# set -e stops the execution of a script if a command or pipeline has an error
set -e

# modifying config.json
JQ_FILTERS_CONFIG="."

if [[ "$LOG_LEVEL" ]]; then
    if [[ "$LOG_LEVEL" == "info" || "$LOG_LEVEL" == "debug" || "$LOG_LEVEL" == "trace" ]]; then
        JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .log.logLevel=\"$LOG_LEVEL\""
        echo "Log level has been modified to $LOG_LEVEL"
    else
        echo "The log level you provided is incorrect (info/debug/trace)"
    fi
fi

if [[ "$WORKERS" ]]; then
    JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .workers=\"$WORKERS\""
fi

if [[ "$REDIS_HOST" ]]; then
    JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .redis.host=\"$REDIS_HOST\""
fi

if [[ "$REDIS_PORT" ]]; then
    JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .redis.port=\"$REDIS_PORT\""
fi

if [[ "$VAULTD_HOST" ]]; then
    JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .vaultd.host=\"$VAULTD_HOST\""
fi

if [[ "$VAULTD_PORT" ]]; then
    JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .vaultd.port=\"$VAULTD_PORT\""
fi

if [[ "$HEALTHCHECKS_ALLOWFROM" ]]; then
    JQ_FILTERS_CONFIG="$JQ_FILTERS_CONFIG | .healthChecks.allowFrom=[\"$HEALTHCHECKS_ALLOWFROM\"]"
fi

if [[ $JQ_FILTERS_CONFIG != "." ]]; then
    jq "$JQ_FILTERS_CONFIG" config.json > config.json.tmp
    mv config.json.tmp config.json
fi

exec "$@"
