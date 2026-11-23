#!/bin/sh
set -e

# Ensure runtime directories exist in bidirectional volume and have proper permissions
mkdir -p /app/config/data /app/config/artifacts /app/config/data/logs /app/config/data/downloads /app/config/data/credentials /app/config/data/oauth_responses 2>/dev/null || true
mkdir -p /home/node/.gemini/antigravity-cli /home/node/.config/antigravity /root/.gemini/antigravity-cli /app/config/data/credentials /app/config/data/logs 2>/dev/null || true
chmod 755 /root 2>/dev/null || true
chown -R node:node /root/.gemini /home/node 2>/dev/null || true
chmod -R 777 /app/config/data /app/config/artifacts /home/node/.gemini /home/node/.config /home/node /root/.gemini 2>/dev/null || true
export HOME=/home/node
export USER=node
export XDG_CONFIG_HOME=/home/node/.config

# Pre-configure automated headless tool permissions in Antigravity settings.json
cat << 'EOF' > /tmp/antigravity_settings.json
{
  "permissions": {
    "allow": [
      "*",
      "command(*)",
      "command"
    ]
  }
}
EOF
for settings_dir in /home/node/.gemini/antigravity-cli /root/.gemini/antigravity-cli /app/config/data/credentials/antigravity-cli; do
    mkdir -p "$settings_dir" 2>/dev/null || true
    cp -f /tmp/antigravity_settings.json "$settings_dir/settings.json" 2>/dev/null || true
done
rm -f /tmp/antigravity_settings.json 2>/dev/null || true

# Restore persisted Antigravity / Gemini CLI credentials into runtime directories
if [ -d "/app/config/data/credentials/antigravity-cli" ]; then
    cp -rf /app/config/data/credentials/antigravity-cli/* /home/node/.gemini/antigravity-cli/ 2>/dev/null || true
    cp -rf /app/config/data/credentials/antigravity-cli/* /root/.gemini/antigravity-cli/ 2>/dev/null || true
fi
latest_token=$(find /app/config/data -name "antigravity-oauth-token" 2>/dev/null | head -n 1 || true)
if [ -n "$latest_token" ] && [ -f "$latest_token" ]; then
    cp -f "$latest_token" /home/node/.gemini/antigravity-cli/ 2>/dev/null || true
    cp -f "$latest_token" /root/.gemini/antigravity-cli/ 2>/dev/null || true
    mkdir -p /app/config/data/credentials/antigravity-cli 2>/dev/null || true
    cp -f "$latest_token" /app/config/data/credentials/antigravity-cli/ 2>/dev/null || true
fi
chown -R node:node /home/node/.gemini /home/node/.config 2>/dev/null || true

# Extract or link Antigravity CLI binary
if [ -x "/usr/local/bin/agy" ]; then
    ln -sf /usr/local/bin/agy /usr/local/bin/antigravity 2>/dev/null || true
elif [ -f "/app/config/data/downloads/agy_cli_linux_x64.tar.gz" ]; then
    tar -zxvf /app/config/data/downloads/agy_cli_linux_x64.tar.gz -C /usr/local/bin/ 2>/dev/null || true
    chmod +x /usr/local/bin/agy 2>/dev/null || true
    ln -sf /usr/local/bin/agy /usr/local/bin/antigravity 2>/dev/null || true
elif command -v curl >/dev/null 2>&1; then
    curl -fsSL https://antigravity.google/cli/install.sh | bash -s -- -d /usr/local/bin 2>/dev/null || true
    chmod +x /usr/local/bin/agy 2>/dev/null || true
    ln -sf /usr/local/bin/agy /usr/local/bin/antigravity 2>/dev/null || true
elif [ -f "/app/config/scripts/antigravity-cli-bridge.sh" ]; then
    cp -f /app/config/scripts/antigravity-cli-bridge.sh /usr/local/bin/antigravity 2>/dev/null || true
    chmod +x /usr/local/bin/antigravity 2>/dev/null || true
    ln -sf /usr/local/bin/antigravity /usr/local/bin/agy 2>/dev/null || true
fi

# Ensure executable permissions on background daemon scripts
chmod +x /app/config/scripts/*.sh 2>/dev/null || true

# Strip NODE_VERSION environment variable to prevent fingerprinting
unset NODE_VERSION

# Launch background Model CLI OAuth dispatcher daemon as node user (Mode 1: Startup daemon)
if [ -x "/app/config/scripts/model-cli-auth-launcher.sh" ]; then
    if [ "$(id -u)" = "0" ]; then
        su -s /bin/sh node -c "export HOME=/home/node USER=node; /app/config/scripts/model-cli-auth-launcher.sh --startup &"
    else
        /app/config/scripts/model-cli-auth-launcher.sh --startup &
    fi
elif [ -x "/app/config/scripts/antigravity-auth-daemon.sh" ]; then
    if [ "$(id -u)" = "0" ]; then
        su -s /bin/sh node -c "export HOME=/home/node USER=node; /app/config/scripts/antigravity-auth-daemon.sh &"
    else
        /app/config/scripts/antigravity-auth-daemon.sh &
    fi
fi

# If running as root, drop privileges to node user
if [ "$(id -u)" = "0" ]; then
    chown -R node:node /app/config/data /app/config/artifacts /home/node /root/.gemini 2>/dev/null || true
    chmod -R 777 /home/node /root/.gemini 2>/dev/null || true
    chmod 755 /root 2>/dev/null || true
    exec su -s /bin/sh node -c "export HOME=/home/node USER=node XDG_CONFIG_HOME=/home/node/.config; unset NODE_VERSION; cd /app; exec $*"
else
    exec "$@"
fi
