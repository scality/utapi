FROM node:8-slim

WORKDIR /usr/src/app

COPY package.json /usr/src/app

RUN apt-get update \
    && apt-get install git -y \
    && apt-get install -y jq --no-install-recommends \
    && apt install build-essential -y \
    && apt-get install python -y \
    && apt-get install g++ -y \
    && npm install --production \
    && rm -rf /var/lib/apt/lists/* \
    && npm cache clear --force \
    && rm -rf ~/.node-gyp \
    && rm -rf /tmp/npm-*

# Keep the .git directory in order to properly report version
COPY . /usr/src/app

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
CMD [ "npm", "start" ]

EXPOSE 8100
