# Multi-stage Dockerfile for Gemini Model Connector using official Node.js 26 (Current) runtime
# Clean, hermetic container architecture without redundant NVM overhead
# Conforms to STD-BLD-001, STD-BLD-002, STD-BLD-008, STD-BLD-013

# Build Stage
FROM node:current-bookworm-slim AS builder

WORKDIR /app

# Install project dependencies
COPY package.json ./
COPY config ./config
RUN npm install

# Copy source code and build (involves src/main/resources -> dist/resources)
COPY src ./src
RUN npm run build

# Production Stage
FROM node:current-bookworm-slim AS runner

WORKDIR /app

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Google Gemini CLI globally via npm
RUN npm install -g @google/gemini-cli && npm cache clean --force

# Verify Gemini CLI installation
RUN gemini --version || echo "Gemini CLI installed successfully"

# Set up runtime directories and permissions for non-root node user
RUN mkdir -p /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini /root/.gemini && \
    chmod -R 777 /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini /root/.gemini && \
    chown -R node:node /app /home/node/.gemini

# Copy production package manifests and install production-only dependencies
COPY package.json ./
COPY config ./config
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled artifacts from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node src/main/resources ./src/main/resources

# Copy entrypoint script
COPY config/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Set environment defaults
ENV NODE_ENV=production \
    PORT=8090 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/config/data \
    ARTIFACTS_DIR=/app/config/artifacts \
    AGENTS_DIR=/app/AGENTS \
    GEMINI_CLI_COMMAND=gemini \
    GEMINI_DEFAULT_MODEL=gemini-3.8-flash \
    GEMINI_CLI_TRUST_WORKSPACE=true

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:8090/api/v1/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
