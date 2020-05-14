FROM warp10io/warp10:2.5.0

RUN sed -i "s~^warpscript.repository.directory = .*~warpscript.repository.directory = /usr/local/share/warpscript~" ${WARP10_HOME}/conf.templates/standalone/*

ADD ./warpscript /usr/local/share/warpscript