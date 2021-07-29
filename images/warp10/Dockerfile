FROM openjdk:8-jdk-buster as warp10

ENV THRIFT_HOME=/usr

ARG WARP10_VERSION=2.8.1-95-g73e7de80

RUN apt-get update \
    && apt-get install -y thrift-compiler \
    && git clone https://github.com/senx/warp10-platform/ /tmp/warp10 \
    && cd /tmp/warp10 \
    && ./gradlew clean build createTarArchive \
    && cp warp10/build/libs/warp10-${WARP10_VERSION}.tar.gz /tmp/warp10.tar.gz

FROM golang:1.14-alpine as builder

ENV WARP10_EXPORTER_VERSION 2.8.1

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

FROM openjdk:8-jdk-alpine

ENV S6_VERSION 2.0.0.1
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS 2

ENV SENSISION_DATA_DIR /data/sensision
ENV SENSISION_PORT 8082

ENV WARP10_VOLUME=/data \
  WARP10_HOME=/opt/warp10 \
  WARP10_DATA_DIR=/data/warp10 \
  SENSISION_HOME=/opt/sensision \
  SENSISION_DATA_DIR=/data/sensision

ENV WARP10_CONF_TEMPLATES ${WARP10_HOME}/conf.templates/standalone

ARG WARP10_VERSION=2.8.1-95-g73e7de80
ARG WARP10_URL=https://github.com/senx/warp10-platform/releases/download/${WARP10_VERSION}
ENV WARP10_VERSION ${WARP10_VERSION}

# Installing utils need by Warp 10 and build-dependencies
RUN apk --no-cache add bash curl fontconfig unifont \
  && apk --no-cache add --virtual=build-dependencies ca-certificates wget


ARG WARPSTUDIO_VERSION=1.0.42
ARG WARPSTUDIO_URL=https://repo1.maven.org/maven2/io/warp10/warp10-plugin-warpstudio/${WARPSTUDIO_VERSION}
ENV WARPSTUDIO_VERSION=${WARPSTUDIO_VERSION}

COPY --from=warp10 /tmp/warp10.tar.gz /opt/

RUN mkdir -p /opt \
  && cd /opt \
  && tar xzf warp10.tar.gz \
  && rm warp10.tar.gz \
  && ln -s /opt/warp10-${WARP10_VERSION} ${WARP10_HOME} \
  && adduser -D -s -H -h ${WARP10_HOME} -s /bin/bash warp10 \
  && chown -h warp10:warp10 ${WARP10_HOME} \
  && wget -q -P ${WARP10_HOME}/lib ${WARPSTUDIO_URL}/warp10-plugin-warpstudio-${WARPSTUDIO_VERSION}.jar

ARG SENSISION_VERSION=1.0.24
ARG SENSISION_URL=https://github.com/senx/sensision/releases/download/${SENSISION_VERSION}
ENV SENSISION_VERSION=${SENSISION_VERSION}

# Getting Sensision
RUN cd /opt \
  && wget -q $SENSISION_URL/sensision-service-${SENSISION_VERSION}.tar.gz \
  && tar xzf sensision-service-${SENSISION_VERSION}.tar.gz \
  && rm sensision-service-${SENSISION_VERSION}.tar.gz \
  && ln -s /opt/sensision-${SENSISION_VERSION} ${SENSISION_HOME} \
  && adduser -D -s -H -h ${SENSISION_HOME} -s /bin/bash sensision \
  && addgroup sensision warp10 \
  && chown -h sensision:sensision ${SENSISION_HOME}

# Deleting build-dependencies
RUN apk --no-cache del build-dependencies

ENV WARP10_JAR=${WARP10_HOME}/bin/warp10-${WARP10_VERSION}.jar \
  WARP10_CONFIG_DIR=${WARP10_HOME}/etc/conf.d \
  WARP10_MACROS=${WARP10_VOLUME}/custom_macros

ENV PATH=$PATH:${WARP10_HOME}/bin

# Exposing port
EXPOSE 8080 8081

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

