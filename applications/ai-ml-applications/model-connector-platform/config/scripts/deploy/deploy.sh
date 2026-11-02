#!/bin/sh
# Standardized POSIX deploy script conforming to STD-BLD-006
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$PROJECT_ROOT"

if [ "$1" = "--down" ]; then
    echo "[DEPLOY] Stopping and removing containers..."
    docker compose -f config/docker/docker-compose.yml down
    exit 0
fi

if [ "$1" = "--logs" ]; then
    docker compose -f config/docker/docker-compose.yml logs -f
    exit 0
fi

echo "[DEPLOY] Deploying ModelConnector dual-service via Docker Compose..."
docker compose -f config/docker/docker-compose.yml up -d --build

echo "✓ Services deployed successfully!"
echo "  Backend Service: http://localhost:8095/api/v1/health"
echo "  Frontend Web UI: http://localhost:3005"
