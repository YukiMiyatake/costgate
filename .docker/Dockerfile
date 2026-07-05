FROM node:22-bookworm

ARG GO_VERSION=1.25.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git wget \
  && rm -rf /var/lib/apt/lists/* \
  && ARCH=$(dpkg --print-architecture) \
  && wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -O /tmp/go.tgz \
  && tar -C /usr/local -xzf /tmp/go.tgz \
  && rm /tmp/go.tgz

ENV PATH="/usr/local/go/bin:${PATH}"
RUN git config --global --add safe.directory /app
WORKDIR /app
