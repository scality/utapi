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

CI=true npm start & bash tests/utils/wait_for_local_port.bash $PORT 40
CI=true npm run $1
