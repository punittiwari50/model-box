#!/bin/sh
set -e

# Ensure runtime directories exist and have open permissions
mkdir -p /app/config/data /app/config/artifacts 2>/dev/null || true
chmod -R 777 /app/config/data /app/config/artifacts 2>/dev/null || true

# Strip NODE_VERSION environment variable to prevent fingerprinting
unset NODE_VERSION

# If running as root, drop privileges to node user
if [ "$(id -u)" = "0" ]; then
    chown -R node:node /app/config/data /app/config/artifacts 2>/dev/null || true
    exec su -s /bin/sh node -c "unset NODE_VERSION; exec $*"
else
    exec "$@"
fi
