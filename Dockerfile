FROM node:10-slim

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN apt-get update \
    && apt-get install build-essential git g++ python -y \
    && npm install --production \
    && apt-get remove git g++ -y

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
CMD [ "npm", "start" ]

EXPOSE 8100
