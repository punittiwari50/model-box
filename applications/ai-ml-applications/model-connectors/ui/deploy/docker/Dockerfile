# syntax=docker/dockerfile:1.4
# Multi-stage optimized build for ModelBox Connectors UI (React + Vite + SCSS)

# Stage 1: Build static bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Optimize build cache: copy package manifest first
COPY package.json ./

RUN npm install --ignore-scripts --prefer-offline

# Copy source assets
COPY index.html ./
COPY config ./config
COPY src ./src

# Compile production bundle
RUN npm run build

# Stage 2: Ultra-minimal Alpine Slim Nginx Runtime (~12MB)
FROM nginx:alpine-slim AS runtime

# Remove default boilerplate files
RUN rm -rf /usr/share/nginx/html/*

# Copy built production assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Lightweight healthcheck using built-in busybox wget
HEALTHCHECK --interval=30s --timeout=3s --retries=2 \
  CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
