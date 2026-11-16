#!/usr/bin/env bash
# ==============================================================================
# Model Connector Platform - Docker Build & Run Pipeline (Bash)
# Invariants Enforced:
# 1. All node and python scripts execute STRICTLY inside Docker containers
# 2. Hermetic Docker image build/test/verify without host bind mount dependence
# 3. Dedicated separated Mobile and Desktop UI architectures
# 4. Ultra-lean production images (Frontend Nginx ~30MB, Backend Node)
# 5. Builder image automatically purged post spin-up
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "================================================================================"
echo "  MODEL CONNECTOR PLATFORM - CONTAINER PIPELINE"
echo "  Project Root: ${PROJECT_ROOT}"
echo "================================================================================"

cd "${PROJECT_ROOT}"

echo -e "\n[1/5] Building packages inside hermetic Docker builder container..."
docker compose --project-directory "${PROJECT_ROOT}" -f config/docker/docker-compose.build.yml run --rm model-connector-platform-builder

echo -e "\n[2/5] Running test suites inside Docker tester container..."
docker compose --project-directory "${PROJECT_ROOT}" -f config/docker/docker-compose.build.yml run --rm model-connector-platform-tester

echo -e "\n[3/5] Running architectural verification inside Docker verifier container..."
docker compose --project-directory "${PROJECT_ROOT}" -f config/docker/docker-compose.build.yml run --rm model-connector-platform-verifier

echo -e "\n[4/5] Starting lean runtime containers..."
docker compose -f config/docker/docker-compose.yml up -d --build

echo -e "\n[5/5] Removing temporary builder image and pruning unused Docker images..."
docker rmi model-connector-platform-builder:latest -f || true
docker image prune -a -f || true

echo "================================================================================"
echo "  DEPLOYMENT READY!"
echo "  Desktop Studio:     http://localhost:3005"
echo "  Mobile Responsive:  http://localhost:3005"
echo "  Backend REST API:   http://localhost:8095"
echo "  Health Endpoint:    http://localhost:8095/api/v1/health"
echo "================================================================================"
