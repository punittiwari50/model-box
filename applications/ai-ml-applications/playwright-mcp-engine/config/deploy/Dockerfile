# ==============================================================================
# Playwright MCP Engine - Enterprise Multi-Stage Dockerfile
# Stage 1: Build & Validate
# Stage 2: Hardened, Minimal Runtime with non-root security execution
# ==============================================================================

# --- Stage 1: Builder ---
FROM node:22-alpine AS builder

WORKDIR /build

# Security: Install dependencies strictly based on lockfile/manifest without running arbitrary lifecycle scripts
COPY package.json ./
RUN npm install --ignore-scripts

# Copy configuration, source code, and validation scripts
COPY config/ ./config/
COPY src/ ./src/

# Verify 100% adherence to @/... import conventions
RUN npx tsx config/scripts/verify-imports.ts

# Compile TypeScript and resolve path aliases
RUN npx tsc -p config/tsconfig.json && npx tsc-alias -p config/tsconfig.json

# Prune development dependencies to minimize attack surface and image size
RUN npm prune --omit=dev --ignore-scripts && npm cache clean --force

# --- Stage 2: Hardened Runtime ---
FROM mcr.microsoft.com/playwright/mcp:latest AS runtime

# Label metadata for enterprise image governance
LABEL org.opencontainers.image.title="Playwright MCP Engine" \
      org.opencontainers.image.description="Enterprise Playwright Workflow Execution & MCP Server" \
      org.opencontainers.image.vendor="ModelBox Team" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app

# Switch to root temporarily only to set up permissions and clean caches
USER root

# Install virtual display and web streaming utilities for interactive codegen recording
RUN apt-get update && \
    apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify fluxbox && \
    ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html && \
    rm -rf /var/lib/apt/lists/*

# Create directory structure with correct non-root ownership
RUN mkdir -p /app/dist /app/config /app/logs /app/workflows /app/downloads && \
    chown -R node:node /app

# Copy production artifacts from builder stage with strict ownership
COPY --from=builder --chown=node:node /build/package.json ./package.json
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/dist ./dist
COPY --from=builder --chown=node:node /build/config ./config

# Ensure matching Playwright chromium binary is installed
RUN npx playwright install chromium && chown -R node:node /ms-playwright

# Security Hardening: Switch to unprivileged user (node)
USER node

# Environment parameters for ultra-high performance & concurrency
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8940 \
    MCP_PORT=8941 \
    PLAYWRIGHT_HEADLESS=true \
    PLAYWRIGHT_MAX_CONCURRENCY=25 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    UV_THREADPOOL_SIZE=64 \
    NODE_OPTIONS="--max-old-space-size=4096" \
    STEP_WATCHDOG_TIMEOUT_MS=30000 \
    WORKFLOW_WATCHDOG_TIMEOUT_MS=180000

# Expose HTTP REST and MCP endpoints
EXPOSE 8940 8941

# Enterprise Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "import('node:http').then(h => h.get('http://localhost:8940/health', r => { r.destroy(); process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1)))"

# Graceful termination signal handling
STOPSIGNAL SIGTERM

# Application Entrypoint
ENTRYPOINT ["node", "dist/index.js"]

# Default command: launch in MCP server mode
CMD ["--mcp"]
