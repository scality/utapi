FROM buildpack-deps:jessie-curl

#
# Install apt packages needed by utapi and buildbot_worker
#
ENV LANG C.UTF-8
ENV NODE_VERSION 10.22.0
COPY utapi_packages.list buildbot_worker_packages.list /tmp/

RUN wget https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz \
    && tar -xf node-v${NODE_VERSION}-linux-x64.tar.gz --directory /usr/local --strip-components 1 \ 
    && curl -sS http://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update -qq \
    && cat /tmp/*packages.list | xargs apt-get install -y \
    && pip install pip==9.0.1 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /tmp/*packages.list \
    && rm -f /etc/supervisor/conf.d/*.conf \
    && rm -f node-v${NODE_VERSION}-linux-x64.tar.gz


#
# Run buildbot-worker on startup through supervisor
#
ARG BUILDBOT_VERSION

RUN pip install buildbot-worker==$BUILDBOT_VERSION
RUN pip3 install requests
RUN pip3 install redis
ADD supervisor/buildbot_worker.conf /etc/supervisor/conf.d/
ADD redis/sentinel.conf /etc/sentinel.conf

CMD ["supervisord", "-n"]
