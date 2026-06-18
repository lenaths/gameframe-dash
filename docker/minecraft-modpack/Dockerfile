FROM ghcr.io/pterodactyl/yolks:java_17

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      coreutils \
      curl \
      findutils \
      unzip \
    && rm -rf /var/lib/apt/lists/*

COPY xnt-install-modpack /usr/local/bin/xnt-install-modpack
RUN chmod 0755 /usr/local/bin/xnt-install-modpack

USER container

WORKDIR /home/container
