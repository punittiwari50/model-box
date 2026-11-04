#!/bin/sh
set -e

# Ensure runtime directories exist and have open permissions
mkdir -p /app/config/data /app/config/artifacts /app/config/data/logs 2>/dev/null || true
chmod -R 777 /app/config/data /app/config/artifacts 2>/dev/null || true

# Extract Antigravity CLI binary if tarball exists and binary not yet installed
if [ ! -x "/usr/local/bin/antigravity" ] && [ -f "/app/agy_cli_linux_x64.tar.gz" ]; then
    tar -zxvf /app/agy_cli_linux_x64.tar.gz -C /usr/local/bin/ 2>/dev/null || true
    chmod +x /usr/local/bin/antigravity 2>/dev/null || true
    ln -sf /usr/local/bin/antigravity /usr/local/bin/agy 2>/dev/null || true
fi

# Ensure executable permissions on background daemon scripts
if [ -f "/app/config/scripts/antigravity-auth-daemon.sh" ]; then
    chmod +x /app/config/scripts/antigravity-auth-daemon.sh 2>/dev/null || true
fi

# Strip NODE_VERSION environment variable to prevent fingerprinting
unset NODE_VERSION

# Launch background Antigravity Google OAuth daemon as node user
if [ -x "/app/config/scripts/antigravity-auth-daemon.sh" ]; then
    if [ "$(id -u)" = "0" ]; then
        su -s /bin/sh node -c "/app/config/scripts/antigravity-auth-daemon.sh >/dev/null 2>&1 &"
    else
        /app/config/scripts/antigravity-auth-daemon.sh >/dev/null 2>&1 &
    fi
fi

# If running as root, drop privileges to node user
if [ "$(id -u)" = "0" ]; then
    chown -R node:node /app/config/data /app/config/artifacts 2>/dev/null || true
    exec su -s /bin/sh node -c "unset NODE_VERSION; exec $*"
else
    exec "$@"
fi
