FROM node:8-slim

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN apt-get update \
    && apt-get install git -y \
    && apt install build-essential -y \
    && apt-get install python -y \
    && apt-get install g++ -y \
    && npm cache clear --force \
    && npm install --production

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
CMD [ "npm", "start" ]

EXPOSE 8100
