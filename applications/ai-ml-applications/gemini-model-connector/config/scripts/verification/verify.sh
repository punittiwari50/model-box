#!/usr/bin/env bash
# Hermetic In-Container Verification Script
# Conforms to STD-BLD-001 & STD-BLD-006

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================================="
echo " Running Hermetic Verification inside Docker Container    "
echo " Working Directory: $PROJECT_ROOT                         "
echo " Config Root: config/docker/                              "
echo "=========================================================="

echo "[1/2] Starting Node.js Gemini Model Connector container..."
docker compose -f config/docker/docker-compose.yml up -d gemini-model-connector

echo "[2/2] Running Python verification suite inside gemini-python-verifier container..."
docker compose -f config/docker/docker-compose.yml run --rm gemini-python-verifier

echo "=========================================================="
echo " In-container verification completed successfully! [OK]   "
echo "=========================================================="
