#!/bin/sh
exporter/redis_exporter
status=$?
if [ $status -ne 0 ]; 
then
  echo "Failed to start exporter: $status"
  exit $status
else
  echo "redis exporter started"
fi

redis-server
status=$?
if [ $status -ne 0 ]; then
  echo "Failed to start redis: $status"
  exit $status
else
  echo "redis started"
fi

