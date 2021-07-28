FROM redis:alpine

ENV S6_VERSION 2.0.0.1
ENV EXPORTER_VERSION 1.24.0
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS 2

USER root
RUN apk update && apk add wget

RUN wget https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-amd64.tar.gz -O /tmp/s6-overlay-amd64.tar.gz \
    && tar xzf /tmp/s6-overlay-amd64.tar.gz -C / \
    && rm -rf /tmp/s6-overlay-amd64.tar.gz 

RUN wget https://github.com/oliver006/redis_exporter/releases/download/v${EXPORTER_VERSION}/redis_exporter-v${EXPORTER_VERSION}.linux-amd64.tar.gz -O redis_exporter.tar.gz \
    && tar xzf redis_exporter.tar.gz -C / 

EXPOSE 6379
EXPOSE 9121

WORKDIR /..

ADD ./images/redis/s6 /etc
CMD /init