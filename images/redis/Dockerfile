FROM redis:alpine

USER root
RUN apk update && apk add wget

RUN wget https://github.com/oliver006/redis_exporter/releases/download/v1.24.0/redis_exporter-v1.24.0.linux-amd64.tar.gz -O redis_exporter.tar.gz \
    && tar xzf redis_exporter.tar.gz -C / \ 
    && mv /redis_exporter-v1.24.0.linux-amd64 /exporter

EXPOSE 6379
EXPOSE 9121

WORKDIR /..

COPY images/redis/start.sh start.sh
RUN chmod +x start.sh
CMD [ "./start.sh" ] 


