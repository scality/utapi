FROM buildpack-deps:jessie-curl

#
# Install apt packages needed by backbeat and buildbot_worker
#
ENV LANG C.UTF-8
COPY utapi_packages.list buildbot_worker_packages.list /tmp/

RUN curl -sL https://deb.nodesource.com/setup_10.x | bash - \
    && curl -sS http://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update -qq \
    && cat /tmp/*packages.list | xargs apt-get install -y \
    && pip install pip==9.0.1 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /tmp/*packages.list \
    && rm -f /etc/supervisor/conf.d/*.conf


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
