# Node.js 24 LTS on Debian 13 (trixie). Debian 12 left standard security support in July 2026
# and Node.js 22 is maintenance-only (EOL April 2027).
# Pin digest in release CI for full supply-chain pinning:
#   docker buildx imagetools inspect node:24.22.1-trixie-slim --format '{{.Manifest.Digest}}'
FROM node:24.22.1-trixie-slim

# Docker's apt signing key. apt reads ASCII-armored keys directly, so curl/gnupg are not needed.
ADD --chmod=644 https://download.docker.com/linux/debian/gpg /etc/apt/keyrings/docker.asc

# Only runtime dependencies are installed: no curl, gnupg, unzip or skopeo
# (remote image digests are looked up by backend/registry-client.ts).
RUN apt update && apt install --yes --no-install-recommends \
    ca-certificates \
    dumb-init \
    && echo \
         "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
         "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" \
         > /etc/apt/sources.list.d/docker.list \
    && apt update \
    && apt --yes --no-install-recommends install \
         docker-ce-cli \
         docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# The npm bundled with Node 24.22.1 ships vulnerable copies of undici, brace-expansion,
# ip-address, http-cache-semantics and postcss-selector-parser. npm stays in the image
# because `npm run reset-password` is the documented password recovery command.
RUN npm install --global npm@11.21.1 \
    && npm config set update-notifier false --location=global \
    && npm cache clean --force \
    && rm -rf /root/.npm /tmp/*
