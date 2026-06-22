FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    bubblewrap \
    ca-certificates \
    git \
    g++ \
    make \
    python3 \
    tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY . .

ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

COPY docker/entrypoint.sh /usr/local/bin/codex-web-console-entrypoint
RUN chmod +x /usr/local/bin/codex-web-console-entrypoint

ENTRYPOINT ["tini", "--", "codex-web-console-entrypoint"]
CMD ["bash"]
