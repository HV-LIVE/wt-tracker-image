FROM node:20.14.0-alpine3.20

RUN echo -e "https://mirror.tuna.tsinghua.edu.cn/alpine/v3.20/main/\nhttps://mirror.tuna.tsinghua.edu.cn/alpine/v3.20/community/" > /etc/apk/repositories && \
    apk add --no-cache gcompat && \
    apk add --no-cache bash

# 调试工具
# RUN apk add --no-cache vim curl

ADD ./launcher /opt/launcher
RUN chmod +x /opt/launcher/launch.sh

ADD ./wt-tracker /opt/wt-tracker
RUN cd /opt/wt-tracker && npm install
RUN mkdir -p /etc/wt-tracker && echo "{}" > /etc/wt-tracker/config.json
WORKDIR /opt/wt-tracker

EXPOSE 8000
VOLUME [ "/etc/wt-tracker" ]

ENTRYPOINT [ "/opt/launcher/launch.sh" ]
