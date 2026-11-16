#!/usr/bin/env bash
# ==============================================================================
# ModelBox Vault Secrets Push Automation Script (Bash)
# Reads all *-secure.env files and pushes values into the Docker Container Vault.
# Adheres to zero-secret-in-git enterprise policy.
# ==============================================================================
set -euo pipefail

VAULT_CONTAINER_NAME="${1:-model-connectors-vault}"
VAULT_TOKEN="${2:-modelbox-vault-root-token}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=================================================================="
echo "🔐 ModelBox Vault Secrets Push Utility"
echo "=================================================================="

# 1. Verify Vault container is running
echo "[1/4] Verifying Vault container (${VAULT_CONTAINER_NAME})..."
if ! docker ps --filter "name=${VAULT_CONTAINER_NAME}" --filter "status=running" --format "{{.Names}}" | grep -q "${VAULT_CONTAINER_NAME}"; then
    echo "Container '${VAULT_CONTAINER_NAME}' is not running. Launching with Docker Compose..."
    docker compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d vault
    sleep 3
fi

# 2. Find all *-secure.env files
shopt -s nullglob
SECURE_FILES=("${SCRIPT_DIR}"/*-secure.env)
shopt -u nullglob

if [ ${#SECURE_FILES[@]} -eq 0 ]; then
    echo "Warning: No *-secure.env files found in ${SCRIPT_DIR}. Initializing from templates..."
    for tmpl in "${SCRIPT_DIR}"/*-secure.env.example; do
        target="${tmpl%.example}"
        if [ ! -f "${target}" ]; then
            cp "${tmpl}" "${target}"
            echo "Initialized ${target} from template."
        fi
    done
    shopt -s nullglob
    SECURE_FILES=("${SCRIPT_DIR}"/*-secure.env)
    shopt -u nullglob
fi

echo "[2/4] Discovered ${#SECURE_FILES[@]} secure configuration file(s)."

# 3. Ensure secret engine active only if not already mounted
echo "[3/4] Ensuring Vault KV-v2 secret engine is active..."
if ! docker exec -e VAULT_TOKEN="${VAULT_TOKEN}" "${VAULT_CONTAINER_NAME}" vault secrets list -format=json 2>/dev/null | grep -q '"secret/"'; then
    docker exec -e VAULT_TOKEN="${VAULT_TOKEN}" "${VAULT_CONTAINER_NAME}" vault secrets enable -path=secret kv-v2 >/dev/null 2>&1 || true
    echo "  [OK] Enabled KV-v2 secret engine at secret/"
else
    echo "  [OK] Secret engine 'secret/' already active."
fi

# 4. Push secrets
echo "[4/4] Pushing secrets to container vault..."
for file in "${SECURE_FILES[@]}"; do
    base_name="$(basename "${file}")"
    category="$(echo "${base_name}" | sed 's/model-box-//' | sed 's/-secure.env//')"
    vault_path="secret/modelbox/${category}"

    kv_args=()
    while IFS= read -r line || [ -n "$line" ]; do
        line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        if [ -n "$line" ] && [[ ! "$line" =~ ^# ]] && [[ "$line" == *"="* ]]; then
            kv_args+=("$line")
        fi
    done < "${file}"

    if [ ${#kv_args[@]} -gt 0 ]; then
        docker exec -e VAULT_TOKEN="${VAULT_TOKEN}" "${VAULT_CONTAINER_NAME}" vault kv put "${vault_path}" "${kv_args[@]}" >/dev/null
        echo "  ✅ Pushed ${#kv_args[@]} secret key(s) to vault at: ${vault_path}"
    fi
done

echo "=================================================================="
echo "🔒 All sensitive vault credentials pushed successfully to container vault!"
echo "=================================================================="
