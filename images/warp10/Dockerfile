FROM warp10io/warp10:2.6.0

ENV S6_VERSION 2.0.0.1

ENV WARP10_CONF_TEMPLATES ${WARP10_HOME}/conf.templates/standalone
RUN wget https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-amd64.tar.gz -O /tmp/s6-overlay-amd64.tar.gz \
    && tar xzf /tmp/s6-overlay-amd64.tar.gz -C / \
    && rm -rf /tmp/s6-overlay-amd64.tar.gz

# Modify Warp 10 default config
RUN sed -i "s~^warpscript.repository.directory = .*~warpscript.repository.directory = /usr/local/share/warpscript~" ${WARP10_CONF_TEMPLATES}/* \
    && sed -i -e 's|^standalone\.host.*|standalone.host = 0.0.0.0|g' ${WARP10_CONF_TEMPLATES}/*

ADD ./images/warp10/s6 /etc

ADD ./warpscript /usr/local/share/warpscript

CMD /init
