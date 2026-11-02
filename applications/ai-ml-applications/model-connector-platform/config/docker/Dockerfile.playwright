# ==============================================================================
# Model Connector Platform - Hermetic Playwright Sanity & E2E Test Module
# Module: @model-box/model-connector-playwright
# ==============================================================================
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development
ENV FORCE_COLOR=1

# Install required system dependencies for Chromium headless
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 && \
    rm -rf /var/lib/apt/lists/*

# Copy monorepo configurations and required package manifests
COPY package.json package-lock.json ./
COPY packages/model-connector-core/package.json ./packages/model-connector-core/
COPY packages/model-connector-playwright/package.json ./packages/model-connector-playwright/

# Install workspace dependencies and hermetic Playwright browser
RUN npm install && \
    npx playwright install --with-deps chromium

# Copy source trees for core and playwright modules
COPY packages/model-connector-core ./packages/model-connector-core
COPY packages/model-connector-playwright ./packages/model-connector-playwright

# Build core and playwright modules
RUN npm run build --workspace=@model-box/model-connector-core && \
    npm run build --workspace=@model-box/model-connector-playwright

# Default command runs the module sanity test suite
CMD ["npm", "run", "test:sanity", "--workspace=@model-box/model-connector-playwright"]
