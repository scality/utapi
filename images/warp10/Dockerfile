FROM warp10io/warp10:2.6.0

ENV S6_VERSION 2.0.0.1

ENV WARP10_CONF_TEMPLATES ${WARP10_HOME}/conf.templates/standalone

# Modify Warp 10 default config
ENV standalone.host 0.0.0.0
ENV warpscript.repository.directory /usr/local/share/warpscript
ENV warpscript.extension.protobuf io.warp10.ext.protobuf.ProtobufWarpScriptExtension
ENV warpscript.extension.macrovalueencoder 'io.warp10.continuum.ingress.MacroValueEncoder$Extension'
# ENV warpscript.extension.debug io.warp10.script.ext.debug.DebugWarpScriptExtension

RUN wget https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-amd64.tar.gz -O /tmp/s6-overlay-amd64.tar.gz \
    && tar xzf /tmp/s6-overlay-amd64.tar.gz -C / \
    && rm -rf /tmp/s6-overlay-amd64.tar.gz

# Install protobuf extestion
ADD https://dl.bintray.com/senx/maven/io/warp10/warp10-ext-protobuf/1.1.0-uberjar/warp10-ext-protobuf-1.1.0-uberjar.jar /opt/warp10/lib/

ADD ./images/warp10/s6 /etc
ADD ./warpscript /usr/local/share/warpscript

CMD /init