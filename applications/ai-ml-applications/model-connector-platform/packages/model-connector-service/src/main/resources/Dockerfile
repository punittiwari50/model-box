# ==============================================================================
# Model Connector Service - Multi-Stage Production Runtime with Omni-Channel Model CLIs
# Equipped with customized, organized CLI installation & package download locations.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Hermetic TypeScript Build Stage
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/model-connector-core/package.json ./packages/model-connector-core/
COPY packages/model-connector-client/package.json ./packages/model-connector-client/
COPY packages/model-connector-service/package.json ./packages/model-connector-service/

RUN npm install

COPY packages/model-connector-core ./packages/model-connector-core
COPY packages/model-connector-client ./packages/model-connector-client
COPY packages/model-connector-service ./packages/model-connector-service
COPY config ./config

RUN npm run build --workspace=@model-box/model-connector-core && \
    npm run build --workspace=@model-box/model-connector-client && \
    npm run build --workspace=@model-box/model-connector-service

# ------------------------------------------------------------------------------
# Stage 2: Hardened Non-Root Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Custom CLI & Package Download Directory Configuration (Customizable at Build)
ARG CLI_BASE_DIR=/opt/model-connector
ARG CLI_BIN_DIR=${CLI_BASE_DIR}/bin
ARG CLI_CACHE_DIR=${CLI_BASE_DIR}/cache
ARG CLI_NPM_PREFIX=${CLI_BASE_DIR}/npm
ARG CLI_MODELS_DIR=${CLI_BASE_DIR}/models

ENV CLI_BASE_DIR=${CLI_BASE_DIR}
ENV CLI_BIN_DIR=${CLI_BIN_DIR}
ENV CLI_CACHE_DIR=${CLI_CACHE_DIR}
ENV CLI_NPM_PREFIX=${CLI_NPM_PREFIX}
ENV CLI_MODELS_DIR=${CLI_MODELS_DIR}
ENV MODEL_CLI_PATH="${CLI_NPM_PREFIX}/bin:${CLI_BIN_DIR}"
ENV PATH="${CLI_NPM_PREFIX}/bin:${CLI_BIN_DIR}:${PATH}"

ENV NODE_ENV=production
ENV PORT=8095
ENV HOST=0.0.0.0
ENV CONTAINER_ROLE=runner
ENV IS_BUILDER=false
ENV ENABLE_SIMULATION_FALLBACK=false
ENV ALLOW_MOCK_FALLBACK=false

# Supported 6 Model Families Environment Variables (Injected at Runtime)
ENV GEMINI_DEFAULT_MODEL=gemini-3.8-flash
ENV GROK_DEFAULT_MODEL=grok-3
ENV COPILOT_DEFAULT_MODEL=copilot-gpt-4o
ENV CHATGPT_DEFAULT_MODEL=gpt-4o
ENV CLAUDE_DEFAULT_MODEL=claude-3-7-sonnet
ENV OLLAMA_DEFAULT_MODEL=llama3.2
ENV FALLBACK_PROVIDER=ollama
ENV FALLBACK_DEFAULT_MODEL=llama3.2
ENV FALLBACK_BASE_URL=http://localhost:11435
ENV OLLAMA_BASE_URL=http://localhost:11435
ENV FALLBACK_CLI_COMMAND=ollama

# Install curl, ca-certificates, and create well-organized custom CLI directories
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    mkdir -p ${CLI_BIN_DIR} ${CLI_CACHE_DIR}/npm ${CLI_CACHE_DIR}/downloads ${CLI_NPM_PREFIX} ${CLI_MODELS_DIR} /app/config/data && \
    chown -R node:node ${CLI_BASE_DIR} /app && \
    rm -rf /var/lib/apt/lists/*

# Configure npm global prefix and cache to use well-organized custom location
RUN npm config set prefix ${CLI_NPM_PREFIX} --global && \
    npm config set cache ${CLI_CACHE_DIR}/npm --global

# Install latest available model CLIs into the custom location individually so all valid CLIs succeed
RUN npm install -g @google/gemini-cli@latest --ignore-scripts --no-audit || true && \
    npm install -g @anthropic-ai/claude-code@latest --ignore-scripts --no-audit || true && \
    npm install -g @githubnext/github-copilot-cli@latest --ignore-scripts --no-audit || true && \
    npm install -g chatgpt@latest --ignore-scripts --no-audit || true

# Copy package manifests for lean production resolution
COPY package.json package-lock.json ./
COPY packages/model-connector-core/package.json ./packages/model-connector-core/
COPY packages/model-connector-client/package.json ./packages/model-connector-client/
COPY packages/model-connector-service/package.json ./packages/model-connector-service/

# Install ONLY production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/model-connector-core/dist ./packages/model-connector-core/dist
COPY --from=builder /app/packages/model-connector-client/dist ./packages/model-connector-client/dist
COPY --from=builder /app/packages/model-connector-service/dist ./packages/model-connector-service/dist
COPY packages/model-connector-core/src/main/resources/application.yml ./packages/model-connector-core/src/main/resources/application.yml
COPY packages/model-connector-client/src/main/resources/application.yml ./packages/model-connector-client/src/main/resources/application.yml
COPY packages/model-connector-service/src/main/resources/application.yml ./packages/model-connector-service/src/main/resources/application.yml
COPY config/database ./config/database

USER node

EXPOSE 8095 8085 11436

CMD ["node", "packages/model-connector-service/dist/index.js"]
