#!/bin/sh
set -e

# Load NVM virtual environment if present
if [ -d "/usr/local/nvm" ]; then
    export NVM_DIR="/usr/local/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

# Ensure runtime directories exist and have open permissions
mkdir -p /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini 2>/dev/null || true
chmod -R 777 /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini 2>/dev/null || true
chown -R node:node /app/config/data /app/config/artifacts /app/AGENTS /home/node/.gemini 2>/dev/null || true

# Strip NODE_VERSION environment variable to prevent fingerprinting
unset NODE_VERSION

# If running as root, drop to node user with sanitized environment
if [ "$(id -u)" = "0" ]; then
    exec su -s /bin/sh node -c "unset NODE_VERSION; exec $*"
else
    exec "$@"
fi
