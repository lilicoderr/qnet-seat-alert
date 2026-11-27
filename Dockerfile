FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/lilicoderr/qnet-seat-alert" \
      org.opencontainers.image.description="Alert-only Q-Net exam seat watcher" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY schemas ./schemas
COPY examples ./examples
ENV NODE_ENV=production \
    QNET_CONFIG=/data/config.json \
    QNET_STATE=/data/state.json
VOLUME /data
USER node
ENTRYPOINT ["node", "bin/qnet-alert.js"]
CMD ["--json"]
