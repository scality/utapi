FROM buildpack-deps:bullseye-curl

#
# Install apt packages needed by utapi and buildbot_worker
#

ENV LANG C.UTF-8
ENV NODE_VERSION 10.22.0
ENV PATH=$PATH:/utapi/node_modules/.bin
ENV NODE_PATH=/utapi/node_modules

COPY eve/workers/unit_and_feature_tests/utapi_packages.list eve/workers/unit_and_feature_tests/buildbot_worker_packages.list /tmp/

WORKDIR /utapi

#
# Install Nodejs, yarn, git-lfs and buildbot deps
#

RUN wget https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz \
    && tar -xf node-v${NODE_VERSION}-linux-x64.tar.gz --directory /usr/local --strip-components 1 \
    && apt-get update -qq \
    && apt-get install -y apt-transport-https \
    && curl -sS http://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && curl -sSL https://packagecloud.io/github/git-lfs/gpgkey | apt-key add - \
    && echo "deb https://packagecloud.io/github/git-lfs/debian/ bullseye main" | tee /etc/apt/sources.list.d/lfs.list \
    && curl -sSL https://download.docker.com/linux/debian/gpg | apt-key add - \
    && echo "deb [arch=amd64] https://download.docker.com/linux/debian bullseye stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update -qq \
    && cat /tmp/*packages.list | xargs apt-get install -y --no-install-recommends\
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /tmp/*packages.list \
    && rm -f /etc/supervisor/conf.d/*.conf \
    && rm -f node-v${NODE_VERSION}-linux-x64.tar.gz

#
# Install yarn dependencies
#

COPY package.json yarn.lock /utapi/

RUN yarn cache clean \
    && yarn install --frozen-lockfile \
    && yarn cache clean

#
# Install buildbot
#

ARG BUILDBOT_VERSION=2.7.0
RUN pip3 install buildbot-worker==$BUILDBOT_VERSION requests redis
ADD eve/workers/unit_and_feature_tests/supervisor/buildbot_worker.conf /etc/supervisor/conf.d/
ADD eve/workers/unit_and_feature_tests/redis/sentinel.conf /etc/sentinel.conf

#
# Run buildbot-worker on startup through supervisor
#

CMD ["supervisord", "-n"]
