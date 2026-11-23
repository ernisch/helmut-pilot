FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY worker.js server.js helmut-flags.json ./
COPY lib ./lib
COPY scripts/bb-nachweis-importpaket-generator.js ./scripts/

ARG HELMUT_COMMIT_SHA
ENV HELMUT_COMMIT_SHA=${HELMUT_COMMIT_SHA}
USER node
CMD ["node", "worker.js"]
