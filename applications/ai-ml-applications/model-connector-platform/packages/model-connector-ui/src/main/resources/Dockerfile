# ==============================================================================
# Model Connector UI - Multi-Stage Production Runtime
# Builds Vite React bundle and serves via ultra-lean Nginx Alpine (~30MB)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Hermetic Frontend Build Stage
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/model-connector-core/package.json ./packages/model-connector-core/
COPY packages/model-connector-ui/package.json ./packages/model-connector-ui/

RUN npm install

COPY packages/model-connector-core ./packages/model-connector-core
COPY packages/model-connector-ui ./packages/model-connector-ui

RUN npm run build --workspace=@model-box/model-connector-core && \
    npm run build --workspace=@model-box/model-connector-ui

# ------------------------------------------------------------------------------
# Stage 2: Hardened Nginx Production Web Server
# ------------------------------------------------------------------------------
FROM nginx:alpine-slim AS runner

COPY --from=builder /app/packages/model-connector-ui/dist /usr/share/nginx/html
COPY packages/model-connector-ui/src/main/resources/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
