#!/bin/sh
set -e

mkdir -p /vault/file /vault/config /vault/logs
chown -R vault:vault /vault

cat << 'EOF' > /vault/config/local.json
{
  "storage": {
    "file": {
      "path": "/vault/file"
    }
  },
  "listener": {
    "tcp": {
      "address": "0.0.0.0:8200",
      "tls_disable": 1
    }
  },
  "default_lease_ttl": "720h",
  "max_lease_ttl": "8760h",
  "ui": true,
  "disable_mlock": true,
  "api_addr": "http://127.0.0.1:8200"
}
EOF
chown vault:vault /vault/config/local.json

export VAULT_ADDR="http://127.0.0.1:8200"
MASTER_TOKEN="${VAULT_MASTER_TOKEN:-modelbox-vault-root-token}"

echo "[Vault Server] Starting persistent file-backed Vault server..."
su-exec vault vault server -config=/vault/config/local.json &
VAULT_PID=$!

echo "[Vault Server] Waiting for Vault API..."
for i in $(seq 1 30); do
    STATUS_CODE=$(vault status >/dev/null 2>&1; echo $?)
    if [ "$STATUS_CODE" -eq 0 ] || [ "$STATUS_CODE" -eq 2 ]; then
        break
    fi
    sleep 1
done

INIT_JSON="/vault/file/init.json"
INIT_STATUS=$(vault status -format=json 2>/dev/null | jq -r '.initialized // false')

if [ "$INIT_STATUS" != "true" ]; then
    echo "[Vault Server] Initializing persistent Vault storage..."
    vault operator init -key-shares=1 -key-threshold=1 -format=json > "$INIT_JSON"
    chown vault:vault "$INIT_JSON"
    chmod 600 "$INIT_JSON"
    
    UNSEAL_KEY=$(jq -r '.unseal_keys_b64[0]' "$INIT_JSON")
    ROOT_TOKEN=$(jq -r '.root_token' "$INIT_JSON")
    
    echo "$UNSEAL_KEY" > /vault/file/unseal_key
    echo "$ROOT_TOKEN" > /vault/file/root_token
    chown vault:vault /vault/file/unseal_key /vault/file/root_token
    chmod 600 /vault/file/unseal_key /vault/file/root_token
    
    echo "[Vault Server] Unsealing vault..."
    vault operator unseal "$UNSEAL_KEY"
    
    echo "[Vault Server] Creating master token ($MASTER_TOKEN)..."
    VAULT_TOKEN="$ROOT_TOKEN" vault token create -id="$MASTER_TOKEN" -policy="root" -orphan -period="8760h" >/dev/null 2>&1 || true
    
    echo "[Vault Server] Enabling KV-v2 secret engine at secret/..."
    VAULT_TOKEN="$MASTER_TOKEN" vault secrets enable -path=secret kv-v2 >/dev/null 2>&1 || true
    echo "[Vault Server] Persistent Vault initialized, unsealed, and ready."
else
    SEALED_STATUS=$(vault status -format=json 2>/dev/null | jq -r '.sealed // false')
    if [ "$SEALED_STATUS" = "true" ]; then
        echo "[Vault Server] Vault is sealed. Unsealing from persistent storage..."
        if [ -f /vault/file/unseal_key ]; then
            UNSEAL_KEY=$(cat /vault/file/unseal_key)
        else
            UNSEAL_KEY=$(jq -r '.unseal_keys_b64[0]' "$INIT_JSON")
        fi
        vault operator unseal "$UNSEAL_KEY"
        echo "[Vault Server] Vault successfully unsealed."
    else
        echo "[Vault Server] Vault is unsealed and ready."
    fi
    
    if [ -f /vault/file/root_token ]; then
        ROOT_TOKEN=$(cat /vault/file/root_token)
        VAULT_TOKEN="$ROOT_TOKEN" vault token create -id="$MASTER_TOKEN" -policy="root" -orphan -period="8760h" >/dev/null 2>&1 || true
    fi
fi

echo "[Vault Server] Ready for requests on http://0.0.0.0:8200"
wait "$VAULT_PID"
