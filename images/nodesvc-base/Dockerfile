ARG DEBIAN_FRONTEND=noninteractive
ARG UTAPI_VERSION=latest
FROM ghcr.io/scality/utapi:${UTAPI_VERSION} AS base

FROM node:22.14.0-bookworm-slim

# Prepare runtime environment
ENV USER="scality"
ENV HOME_DIR="/home/${USER}" \
    LOG_DIR="/logs" \
    CONF_DIR="/conf" \
    DATA_DIR="/data" \
    SUP_RUN_DIR="/var/run/supervisor"

RUN mv /home/node ${HOME_DIR} && \
    useradd -ms /bin/bash ${USER} && \
    usermod -aG node ${USER} && \
    mkdir ${LOG_DIR} && chown ${USER} ${LOG_DIR} && \
    mkdir ${CONF_DIR} && chown ${USER} ${CONF_DIR} && \
    mkdir ${DATA_DIR} && chown ${USER} ${DATA_DIR} && \
    mkdir -m 777 ${SUP_RUN_DIR} && chown ${USER} ${SUP_RUN_DIR}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    logrotate \
    supervisor \
    && apt-get clean \
    && apt-get -y autoremove

ARG BALLOT_VERSION=1.0.2
ADD --chmod=0755 https://github.com/scality/ballot/releases/download/v${BALLOT_VERSION}/ballot-v${BALLOT_VERSION}-linux-amd64 /usr/local/bin/ballot

COPY --from=base --chown=${USER}:${USER} /usr/src/app/node_modules ${HOME_DIR}/utapi/node_modules
COPY --chown=${USER}:${USER} . ${HOME_DIR}/utapi

USER ${USER}
WORKDIR ${HOME_DIR}/utapi

ENV UTAPI_CONFIG_FILE=${CONF_DIR}/config.json

EXPOSE 8100

CMD ["bash", "-c", "source ${CONF_DIR}/env && export && supervisord -c ${CONF_DIR}/${SUPERVISORD_CONF}"]
