#!/bin/bash

set -x
set -eu -o pipefail

# port for utapi server
PORT=8100

trap killandsleep EXIT

killandsleep () {
  kill -9 $(lsof -t -i:$PORT) || true
  sleep 10
}

UTAPI_INTERVAL_TEST_MODE=$1 npm start & bash tests/utils/wait_for_local_port.bash $PORT 40
UTAPI_INTERVAL_TEST_MODE=$1 npm run $2
