#!/usr/bin/env bash
# Hermetic Deployment & Handover Script
# Conforms to STD-BLD-006

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================================="
echo " Deploying Gemini Model Connector Stack in Docker        "
echo " Working Directory: $PROJECT_ROOT                         "
echo " Config Root: config/docker/                              "
echo "=========================================================="

docker compose -f config/docker/docker-compose.yml up -d gemini-model-connector

echo "Waiting for service health probe..."
HEALTHY=false
for i in {1..15}; do
    if curl -sf http://127.0.0.1:8090/api/v1/health | grep -q '"status":"HEALTHY"'; then
        HEALTHY=true
        break
    fi
    sleep 1
done

if [ "$HEALTHY" = true ]; then
    echo "Service is healthy and ready!"
    echo "Dashboard: http://127.0.0.1:8090/"
    echo "Health:    http://127.0.0.1:8090/api/v1/health"
else
    echo "Service failed health probe check within timeout period." >&2
    exit 1
fi
