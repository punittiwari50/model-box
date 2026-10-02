# syntax=docker/dockerfile:1.4
# Pure Node.js Production Container for ModelBox Connectors UI (React + Vite + SCSS)

FROM node:22-alpine AS runtime

WORKDIR /app

# Optimize build caching: copy package manifest first
COPY package.json ./
RUN npm install --prefer-offline

# Copy source assets & configuration
COPY index.html ./
COPY config ./config
COPY src ./src

# Compile production bundle
RUN npm run build

# Production runtime configuration
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV VITE_BACKEND_URL=http://model-connectors-service:8000

EXPOSE 3000

# Native Node/Vite preview healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

# Launch production preview server in Node.js
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
