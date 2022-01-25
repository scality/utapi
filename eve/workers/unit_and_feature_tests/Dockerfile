FROM node:16

#
# Install apt packages needed by utapi and buildbot_worker
#

ENV LANG C.UTF-8
ENV PATH=$PATH:/utapi/node_modules/.bin
ENV NODE_PATH=/utapi/node_modules

COPY eve/workers/unit_and_feature_tests/utapi_packages.list eve/workers/unit_and_feature_tests/buildbot_worker_packages.list /tmp/

WORKDIR /utapi

RUN curl -sS http://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update -qq \
    && cat /tmp/*packages.list | xargs apt-get install -y \
    && pip install pip==9.0.1 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /tmp/*packages.list \
    && rm -f /etc/supervisor/conf.d/*.conf

#
# Install yarn dependencies
#

COPY package.json yarn.lock /utapi/

RUN yarn cache clean \
    && yarn install --frozen-lockfile \
    && yarn cache clean
#
# Run buildbot-worker on startup through supervisor
#
ARG BUILDBOT_VERSION

RUN pip install buildbot-worker==$BUILDBOT_VERSION
RUN pip3 install requests
RUN pip3 install redis
ADD eve/workers/unit_and_feature_tests/supervisor/buildbot_worker.conf /etc/supervisor/conf.d/
ADD eve/workers/unit_and_feature_tests/redis/sentinel.conf /etc/sentinel.conf

CMD ["supervisord", "-n"]
