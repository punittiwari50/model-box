#!/bin/sh
set -e

# Ensure runtime directories exist in bidirectional volume and have proper permissions
mkdir -p /app/config/data /app/config/artifacts /app/config/data/logs /app/config/data/downloads /app/config/data/credentials /app/config/data/oauth_responses 2>/dev/null || true
chmod -R 777 /app/config/data /app/config/artifacts 2>/dev/null || true

# Extract Antigravity CLI binary if tarball exists in bidirectional downloads or app root
if [ ! -x "/usr/local/bin/antigravity" ]; then
    if [ -f "/app/config/data/downloads/agy_cli_linux_x64.tar.gz" ]; then
        tar -zxvf /app/config/data/downloads/agy_cli_linux_x64.tar.gz -C /usr/local/bin/ 2>/dev/null || true
        chmod +x /usr/local/bin/antigravity 2>/dev/null || true
        ln -sf /usr/local/bin/antigravity /usr/local/bin/agy 2>/dev/null || true
    elif [ -f "/app/agy_cli_linux_x64.tar.gz" ]; then
        tar -zxvf /app/agy_cli_linux_x64.tar.gz -C /usr/local/bin/ 2>/dev/null || true
        chmod +x /usr/local/bin/antigravity 2>/dev/null || true
        ln -sf /usr/local/bin/antigravity /usr/local/bin/agy 2>/dev/null || true
    fi
fi

# Ensure executable permissions on background daemon scripts
chmod +x /app/config/scripts/*.sh 2>/dev/null || true

# Strip NODE_VERSION environment variable to prevent fingerprinting
unset NODE_VERSION

# Launch background Model CLI OAuth dispatcher daemon as node user (Mode 1: Startup daemon)
if [ -x "/app/config/scripts/model-cli-auth-launcher.sh" ]; then
    if [ "$(id -u)" = "0" ]; then
        su -s /bin/sh node -c "/app/config/scripts/model-cli-auth-launcher.sh --startup &"
    else
        /app/config/scripts/model-cli-auth-launcher.sh --startup &
    fi
elif [ -x "/app/config/scripts/antigravity-auth-daemon.sh" ]; then
    if [ "$(id -u)" = "0" ]; then
        su -s /bin/sh node -c "/app/config/scripts/antigravity-auth-daemon.sh &"
    else
        /app/config/scripts/antigravity-auth-daemon.sh &
    fi
fi

# If running as root, drop privileges to node user
if [ "$(id -u)" = "0" ]; then
    chown -R node:node /app/config/data /app/config/artifacts 2>/dev/null || true
    exec su -s /bin/sh node -c "unset NODE_VERSION; exec $*"
else
    exec "$@"
fi
