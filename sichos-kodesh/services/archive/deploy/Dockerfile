# The archive on a VPS: one image, the repository's own workspace, the
# archive root on a mounted volume. Build from the repository root:
#   docker build -f services/archive/deploy/Dockerfile -t sk-archive .
FROM node:22-bookworm-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY services ./services
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY scripts ./scripts
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npm run build -w @sichos-kodesh/archive
ENV SK_ARCHIVE_ROOT=/archive
VOLUME ["/archive"]
ENTRYPOINT ["node", "--no-warnings=ExperimentalWarning", "services/archive/dist/bin/sk-archive.js"]
CMD ["stats"]
