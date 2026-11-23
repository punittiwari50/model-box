#!/usr/bin/env bash
# Hermetic Container Build Script
# Conforms to STD-BLD-001 & STD-BLD-006

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================================="
echo " Building Hermetic Docker Containers (Node.js & Python)  "
echo " Working Directory: $PROJECT_ROOT                         "
echo " Config Root: config/docker/                              "
echo "=========================================================="

docker compose -f config/docker/docker-compose.yml build

echo "=========================================================="
echo " All container images built successfully! [OK]            "
echo "=========================================================="
