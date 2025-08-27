#!/bin/bash

set -x
set -e -o pipefail

# port for utapi server
PORT=8100

trap killandsleep EXIT

killandsleep () {
  kill -9 $(lsof -t -i:$PORT) || true
  sleep 10
}

if [ -z "$SETUP_CMD" ]; then
  SETUP_CMD="start"
fi

# Redirect stderr to a separate file (without "Killed" to look for warnings / error messages)
# While still keeping it in terminal
# ignore punycode warning from oas-tools@2.2.2 in utapiV2 tests

UTAPI_INTERVAL_TEST_MODE=$1 npm $SETUP_CMD \
  2> >(grep -v -E "^Killed$|--trace-deprecation|punycode" | tee -a "setup_$2.stderr.log" >&2) \
  | tee -a "setup_$2.log" &

bash tests/utils/wait_for_local_port.bash $PORT 40

UTAPI_INTERVAL_TEST_MODE=$1 npm run $2 \
  2> >(tee -a "test_$2.stderr.log" >&2) \
  | tee -a "test_$2.log"
