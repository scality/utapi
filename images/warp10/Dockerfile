FROM golang:1.14-alpine as builder

ENV WARP10_EXPORTER_VERSION 2.7.5

RUN apk add zip unzip build-base \
    && wget -q -O exporter.zip https://github.com/centreon/warp10-sensision-exporter/archive/refs/heads/master.zip \
    && unzip exporter.zip \
    && cd warp10-sensision-exporter-master \
    && go mod download \
    && cd tools \
    && go run generate_sensision_metrics.go ${WARP10_EXPORTER_VERSION} \
    && cp sensision.go ../collector/ \
    && cd .. \
    && go build -a -o /usr/local/go/warp10_sensision_exporter

FROM warp10io/warp10:2.7.5

ENV S6_VERSION 2.0.0.1
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS 2

ENV WARP10_CONF_TEMPLATES ${WARP10_HOME}/conf.templates/standalone
ENV SENSISION_DATA_DIR /data/sensision
ENV SENSISION_PORT 8082

# Modify Warp 10 default config
ENV standalone.host 0.0.0.0
ENV standalone.port 4802
ENV standalone.home /opt/warp10
ENV warpscript.repository.directory /usr/local/share/warpscript
ENV warp.token.file /static.tokens
ENV warpscript.extension.protobuf io.warp10.ext.protobuf.ProtobufWarpScriptExtension
ENV warpscript.extension.macrovalueencoder 'io.warp10.continuum.ingress.MacroValueEncoder$Extension'
# ENV warpscript.extension.debug io.warp10.script.ext.debug.DebugWarpScriptExtension

RUN wget https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-amd64.tar.gz -O /tmp/s6-overlay-amd64.tar.gz \
    && tar xzf /tmp/s6-overlay-amd64.tar.gz -C / \
    && rm -rf /tmp/s6-overlay-amd64.tar.gz

# Install protobuf extestion
ADD ./images/warp10/warp10-ext-protobuf-1.2.2-uberjar.jar /opt/warp10/lib/

# Install Sensision exporter
COPY --from=builder /usr/local/go/warp10_sensision_exporter /usr/local/bin/warp10_sensision_exporter

ADD ./images/warp10/s6 /etc
ADD ./warpscript /usr/local/share/warpscript
ADD ./images/warp10/static.tokens /

CMD /init

