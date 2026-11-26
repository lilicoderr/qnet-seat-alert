FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
ENV NODE_ENV=production \
    QNET_CONFIG=/data/config.json \
    QNET_STATE=/data/state.json
VOLUME /data
USER node
ENTRYPOINT ["node", "bin/qnet-alert.js"]
CMD ["--json"]
