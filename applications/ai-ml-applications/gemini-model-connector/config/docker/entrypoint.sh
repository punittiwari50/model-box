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

# If running as root, drop to node user
if [ "$(id -u)" = "0" ]; then
    exec su -s /bin/sh node -c "$*"
else
    exec "$@"
fi
