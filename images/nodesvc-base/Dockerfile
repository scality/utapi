FROM registry.scality.com/federation/nodesvc-base:7.10.5.0

WORKDIR ${HOME_DIR}/utapi

COPY ./package.json ./yarn.lock ${HOME_DIR}/utapi

# Remove when gitcache is sorted out
RUN rm /root/.gitconfig

RUN yarn install --production --frozen-lockfile --network-concurrency 1

COPY . ${HOME_DIR}/utapi

RUN chown -R ${USER} ${HOME_DIR}/utapi

USER ${USER}

CMD bash -c "source ${CONF_DIR}/env && export && supervisord -c ${CONF_DIR}/${SUPERVISORD_CONF}"
