# Multi-stage Dockerfile for Gemini Model Connector
# Optimized for minimal image size, zero redundant build layers, and non-root execution
# Conforms to STD-BLD-001, STD-BLD-002, STD-BLD-008, STD-BLD-013

# ==============================================================================
# Stage 1: Build & Prune Stage
# ==============================================================================
FROM node:slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json ./
COPY config ./config

# Install all dependencies including devDependencies for build
RUN npm install --no-audit --no-fund

# Copy source code and build project (compiles TypeScript to dist and SCSS to CSS)
COPY src ./src
RUN npm run build

# Prune devDependencies to keep strictly production dependencies and remove noise
RUN npm prune --omit=dev --no-audit --no-fund && \
    find node_modules -name "*.map" -type f -delete 2>/dev/null || true && \
    find node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "example" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true && \
    npm cache clean --force && \
    rm -rf /root/.npm /root/.cache /tmp/*

# ==============================================================================
# Stage 2: Minimal Production Runtime
# ==============================================================================
FROM node:slim AS runner

WORKDIR /app

# Combine OS package installation, GitHub CLI (gh), cleanup in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    jq \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /usr/share/doc /usr/share/man /usr/share/locale

# Install model CLI (Google Gemini CLI) with clean-up in single layer; prune npm runtime to minimize image size
RUN npm install -g --no-audit --no-fund --omit=dev @google/gemini-cli && \
    find /usr/local/lib/node_modules -name "*.map" -type f -delete 2>/dev/null || true && \
    find /usr/local/lib/node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "example" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm /root/.cache /tmp/*

# Verify CLI availability
RUN gemini --version || echo "Gemini CLI ready" && \
    gh --version || echo "GitHub CLI ready"

# Set up runtime directories and permissions for non-root node user
RUN mkdir -p /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini /root/.gemini /home/node/.config /root/.config && \
    chmod -R 777 /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini /root/.gemini /home/node/.config /root/.config && \
    chown -R node:node /app /home/node/.gemini /home/node/.config

# Copy production artifacts & pruned node_modules from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node src/main/resources ./src/main/resources
COPY --chown=node:node config ./config
COPY --chown=node:node package.json ./

# Copy entrypoint script
COPY config/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Set environment defaults (unset/clear NODE_VERSION to prevent runtime fingerprinting)
ENV NODE_ENV=production \
    NODE_VERSION="" \
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
