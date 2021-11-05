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

UTAPI_FILTER_BUCKET_DENY='deny-this-bucket' UTAPI_INTERVAL_TEST_MODE=$1 npm $SETUP_CMD 2>&1 | tee -a "/artifacts/setup_$2.log" &
bash tests/utils/wait_for_local_port.bash $PORT 40
UTAPI_INTERVAL_TEST_MODE=$1 npm run $2 | tee -a "/artifacts/test_$2.log"
