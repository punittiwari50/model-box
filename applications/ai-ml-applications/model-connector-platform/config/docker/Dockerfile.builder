# ==============================================================================
# Model Connector Platform - Hermetic Builder & Verification Dockerfile
# Equipped with Node 22 LTS, Python 3, and organized custom CLI installation paths.
# ==============================================================================
FROM node:22-bookworm-slim

WORKDIR /app

ARG CLI_BASE_DIR=/opt/model-connector
ARG CLI_BIN_DIR=${CLI_BASE_DIR}/bin
ARG CLI_CACHE_DIR=${CLI_BASE_DIR}/cache
ARG CLI_NPM_PREFIX=${CLI_BASE_DIR}/npm

ENV CLI_BASE_DIR=${CLI_BASE_DIR}
ENV CLI_BIN_DIR=${CLI_BIN_DIR}
ENV CLI_CACHE_DIR=${CLI_CACHE_DIR}
ENV CLI_NPM_PREFIX=${CLI_NPM_PREFIX}
ENV MODEL_CLI_PATH="${CLI_NPM_PREFIX}/bin:${CLI_BIN_DIR}"
ENV PATH="${CLI_NPM_PREFIX}/bin:${CLI_BIN_DIR}:${PATH}"

ENV NODE_ENV=development
ENV FORCE_COLOR=1
ENV CONTAINER_ROLE=builder
ENV IS_BUILDER=true
ENV ENABLE_SIMULATION_FALLBACK=true
ENV ALLOW_MOCK_FALLBACK=true

# Install Python 3, git, and curl for architectural verification & CLI tool management
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 curl ca-certificates git && \
    mkdir -p ${CLI_BIN_DIR} ${CLI_CACHE_DIR}/npm ${CLI_CACHE_DIR}/downloads ${CLI_NPM_PREFIX} && \
    npm config set prefix ${CLI_NPM_PREFIX} --global && \
    npm config set cache ${CLI_CACHE_DIR}/npm --global && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/model-connector-core/package.json ./packages/model-connector-core/
COPY packages/model-connector-client/package.json ./packages/model-connector-client/
COPY packages/model-connector-service/package.json ./packages/model-connector-service/
COPY packages/model-connector-ui/package.json ./packages/model-connector-ui/
COPY packages/model-connector-playwright/package.json ./packages/model-connector-playwright/
RUN npm install

COPY . /app

CMD ["sh", "-c", "npm run clean && npm run build"]
