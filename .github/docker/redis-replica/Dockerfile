# Creating this image for the CI as GitHub Actions
# is unable to overwrite the entrypoint

ARG REDIS_IMAGE="redis:latest"
FROM ${REDIS_IMAGE}

ENV REDIS_LISTEN_PORT 6380
ENV REDIS_MASTER_HOST redis
ENV REDIS_MASTER_PORT_NUMBER 6379


ENTRYPOINT redis-server \
    --port ${REDIS_LISTEN_PORT} \
    --slaveof ${REDIS_MASTER_HOST} ${REDIS_MASTER_PORT_NUMBER}
