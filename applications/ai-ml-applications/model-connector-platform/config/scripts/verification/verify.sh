#!/bin/sh
# Standardized POSIX verification script conforming to STD-BLD-006 & STD-COD-009
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=========================================================="
echo " Running ModelConnector Platform Verification"
echo "=========================================================="

cd "$PROJECT_ROOT"

python3 "$SCRIPT_DIR/verify_platform.py"

echo "✓ Verification completed successfully with zero defects!"
