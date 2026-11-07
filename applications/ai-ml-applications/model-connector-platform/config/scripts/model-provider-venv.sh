#!/usr/bin/env bash
# ==============================================================================
# ModelBox Provider Virtual Environment Manager (modenv / model-venv)
# Purpose: Isolated runtime & credential environments per Model Provider, User, and Client
# Analogy: Similar to nvm for Node.js, pyenv/venv for Python
# Architecture: OOP Shell Modules, DI, Strict Concurrency & Multi-Tenant Isolation
# Constraints: Zero Node/Python/Java, Pure POSIX/Bash, YAML Config Driven
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/auth-config.yml"

# ==============================================================================
# Module: YamlConfigReader
# ==============================================================================
read_yaml_value() {
  local key="$1"
  local default_val="${2:-}"
  if [ -f "$CONFIG_FILE" ]; then
    local parsed
    parsed=$(awk -F': *' -v target="$key" '
      $1 ~ ("(^|[[:space:]]+)" target "$") {
        val = $2;
        sub(/^["'\''[:space:]]+/, "", val);
        sub(/["'\''[:space:]]+$/, "", val);
        print val;
        exit;
      }
    ' "$CONFIG_FILE" 2>/dev/null || true)
    if [ -n "$parsed" ]; then
      echo "$parsed"
      return 0
    fi
  fi
  echo "$default_val"
}

readonly DEFAULT_VENVS_DIR="$(read_yaml_value "default_venvs_dir" "/app/config/data/venvs")"
readonly DATETIME_PATTERN="$(read_yaml_value "datetime_pattern" "%Y-%m-%dT%H:%M:%SZ")"
readonly BACKEND_API_URL="$(read_yaml_value "backend_api_url" "http://localhost:8095/api/v1")"

# ==============================================================================
# Module: VenvPathResolver
# Sanitizes identifiers to safe directory names
# ==============================================================================
model_venv_sanitize_key() {
  local raw="$1"
  echo "$raw" | sed -e 's/[^a-zA-Z0-9._-]/_/g'
}

model_venv_resolve_root() {
  local provider="$1"
  local user_email="$2"
  local client_id="${3:-default}"

  local s_provider
  s_provider=$(model_venv_sanitize_key "${provider,,}")
  local s_email
  s_email=$(model_venv_sanitize_key "${user_email,,}")
  local s_client
  s_client=$(model_venv_sanitize_key "${client_id,,}")

  echo "${DEFAULT_VENVS_DIR}/${s_provider}/${s_email}/${s_client}"
}

# ==============================================================================
# Module: VenvLifecycleService
# Initializes and provisions isolated virtual environments
# ==============================================================================
model_venv_init() {
  local provider="$1"
  local user_email="$2"
  local client_id="${3:-default}"

  if [ -z "$provider" ] || [ -z "$user_email" ]; then
    echo "{\"error\":\"Missing required arguments: provider and user_email are mandatory\"}" >&2
    return 1
  fi

  local venv_path
  venv_path=$(model_venv_resolve_root "$provider" "$user_email" "$client_id")

  # Create isolated directory structure
  mkdir -p "${venv_path}/home" \
           "${venv_path}/config" \
           "${venv_path}/data" \
           "${venv_path}/cache" \
           "${venv_path}/run" \
           "${venv_path}/credentials" \
           "${venv_path}/logs" \
           "${venv_path}/bin"

  # Initialize provider-specific directory roots inside the isolated $HOME
  case "${provider,,}" in
    *google*|*gemini*|*antigravity*)
      mkdir -p "${venv_path}/home/.gemini" \
               "${venv_path}/home/.config/antigravity"
      ;;
    *anthropic*|*claude*)
      mkdir -p "${venv_path}/home/.claude" \
               "${venv_path}/home/.anthropic"
      ;;
    *openai*|*chatgpt*|*codex*)
      mkdir -p "${venv_path}/home/.chatgpt" \
               "${venv_path}/home/.openai"
      ;;
    *copilot*|*github*)
      mkdir -p "${venv_path}/home/.copilot" \
               "${venv_path}/home/.config/github-copilot"
      ;;
  esac

  # Initialize local in-container Git tracking in the venv credentials root
  if [ ! -d "${venv_path}/credentials/.git" ]; then
    git -C "${venv_path}/credentials" init -q 2>/dev/null || true
    git -C "${venv_path}/credentials" config user.name "ModelBox VirtualEnv" 2>/dev/null || true
    git -C "${venv_path}/credentials" config user.email "${user_email}" 2>/dev/null || true
  fi

  # Create isolated activate script (Analogy: venv/bin/activate or .nvmrc)
  cat <<ACTIVATE_EOF > "${venv_path}/activate.sh"
# Virtual Environment Activation Script for ModelBox
# Provider: ${provider}
# User: ${user_email}
# Client: ${client_id}
export MODEL_VENV_PATH="${venv_path}"
export MODEL_VENV_PROVIDER="${provider}"
export MODEL_VENV_USER="${user_email}"
export MODEL_VENV_CLIENT="${client_id}"

export HOME="${venv_path}/home"
export XDG_CONFIG_HOME="${venv_path}/config"
export XDG_DATA_HOME="${venv_path}/data"
export XDG_CACHE_HOME="${venv_path}/cache"

# Provider-Specific Config Redirects
export GEMINI_CLI_HOME="${venv_path}/home/.gemini"
export ANTIGRAVITY_CONFIG_DIR="${venv_path}/home/.config/antigravity"
export CLAUDE_CONFIG_DIR="${venv_path}/home/.claude"
export ANTHROPIC_CONFIG_DIR="${venv_path}/home/.anthropic"
export OPENAI_CONFIG_DIR="${venv_path}/home/.openai"
export CHATGPT_CONFIG_DIR="${venv_path}/home/.chatgpt"
export COPILOT_CONFIG_DIR="${venv_path}/home/.copilot"
export GITHUB_COPILOT_CONFIG_DIR="${venv_path}/home/.config/github-copilot"

# Isolated IPC and Runtime FIFO / Locks
export VENV_FIFO_IN="${venv_path}/run/auth_in.fifo"
export VENV_CLI_LOG="${venv_path}/run/auth_out.log"
export VENV_CODE_FILE="${venv_path}/run/auth_code.txt"
export VENV_PID_FILE="${venv_path}/run/auth.pid"
export VENV_LOCK_FILE="${venv_path}/run/auth.lock"
export VENV_CREDENTIALS_DIR="${venv_path}/credentials"
export VENV_LOGS_DIR="${venv_path}/logs"
ACTIVATE_EOF

  chmod +x "${venv_path}/activate.sh"
  echo "$venv_path"
}

# ==============================================================================
# Module: VenvActivator
# Applies isolation environment variables in current shell
# ==============================================================================
model_venv_activate() {
  local provider="$1"
  local user_email="$2"
  local client_id="${3:-default}"

  local venv_path
  venv_path=$(model_venv_init "$provider" "$user_email" "$client_id")
  # shellcheck source=/dev/null
  source "${venv_path}/activate.sh"
  return 0
}

# ==============================================================================
# Module: VenvExecutor
# Runs a subshell command strictly within the target virtual environment
# ==============================================================================
model_venv_exec() {
  local provider="$1"
  local user_email="$2"
  local client_id="$3"
  shift 3

  local venv_path
  venv_path=$(model_venv_init "$provider" "$user_email" "$client_id")

  (
    # shellcheck source=/dev/null
    source "${venv_path}/activate.sh"
    exec "$@"
  )
}

# ==============================================================================
# Module: VenvSnapshotService
# Takes a local VCS commit within the user/client venv and syncs with REST API
# ==============================================================================
model_venv_snapshot() {
  local provider="$1"
  local user_email="$2"
  local client_id="$3"
  local status="$4"
  local session_id="$5"
  local model_id="${6:-default-model}"
  local error_msg="${7:-}"

  local venv_path
  venv_path=$(model_venv_resolve_root "$provider" "$user_email" "$client_id")
  local cred_dir="${venv_path}/credentials"

  if [ -d "$cred_dir" ]; then
    local commit_msg="auth(${status,,}): user=${user_email} client=${client_id} provider=${provider} session=${session_id}"
    if [ -n "$error_msg" ]; then
      commit_msg="${commit_msg} error=${error_msg}"
    fi

    git -C "$cred_dir" add -A 2>/dev/null || true
    git -C "$cred_dir" commit --allow-empty -q -m "$commit_msg" 2>/dev/null || true
    local commit_id
    commit_id=$(git -C "$cred_dir" rev-parse HEAD 2>/dev/null || echo "commit-venv-local")

    # Sync to backend database via REST API
    local api_url="${BACKEND_API_URL}/auth/cli-session/sync"
    local payload
    payload=$(cat <<EOF
{
  "sessionId": "$session_id",
  "provider": "$provider",
  "modelId": "$model_id",
  "status": "$status",
  "userEmail": "$user_email",
  "clientId": "$client_id",
  "commitId": "$commit_id",
  "errorMessage": "$error_msg",
  "venvPath": "$venv_path"
}
EOF
)
    curl -s -X POST "$api_url" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      --max-time 10 >/dev/null 2>&1 || true

    echo "$commit_id"
  fi
}

# ==============================================================================
# Module: VenvInspector
# Lists and inspects active virtual environments
# ==============================================================================
model_venv_list() {
  local target_provider="${1:-}"
  local target_email="${2:-}"

  if [ ! -d "$DEFAULT_VENVS_DIR" ]; then
    echo "[]"
    return 0
  fi

  local entries=()
  while IFS= read -r act_file; do
    if [ -f "$act_file" ]; then
      local v_dir
      v_dir="$(dirname "$act_file")"
      local c_client
      c_client="$(basename "$v_dir")"
      local u_dir
      u_dir="$(dirname "$v_dir")"
      local c_user
      c_user="$(basename "$u_dir")"
      local p_dir
      p_dir="$(dirname "$u_dir")"
      local c_provider
      c_provider="$(basename "$p_dir")"

      if [ -n "$target_provider" ] && [ "${target_provider,,}" != "$c_provider" ]; then
        continue
      fi
      if [ -n "$target_email" ] && [ "$(model_venv_sanitize_key "${target_email,,}")" != "$c_user" ]; then
        continue
      fi

      local has_creds="false"
      if [ -d "${v_dir}/credentials" ] && [ "$(find "${v_dir}/credentials" -type f ! -path '*/.git/*' 2>/dev/null | wc -l)" -gt 0 ]; then
        has_creds="true"
      fi

      local commit_hash=""
      if [ -d "${v_dir}/credentials/.git" ]; then
        commit_hash=$(git -C "${v_dir}/credentials" rev-parse HEAD 2>/dev/null || echo "")
      fi

      entries+=("{\"provider\":\"$c_provider\",\"user\":\"$c_user\",\"clientId\":\"$c_client\",\"path\":\"$v_dir\",\"hasCredentials\":$has_creds,\"commit\":\"${commit_hash:0:7}\"}")
    fi
  done < <(find "$DEFAULT_VENVS_DIR" -name "activate.sh" 2>/dev/null)

  local joined=""
  for e in "${entries[@]}"; do
    if [ -n "$joined" ]; then
      joined="${joined},"
    fi
    joined="${joined}${e}"
  done
  echo "[${joined}]"
}

# ==============================================================================
# CLI Dispatcher
# ==============================================================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  COMMAND="${1:-help}"
  shift || true

  PROVIDER=""
  USER_EMAIL=""
  CLIENT_ID="default"
  EXEC_ARGS=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --provider|-p)
        PROVIDER="$2"
        shift 2
        ;;
      --email|-e)
        USER_EMAIL="$2"
        shift 2
        ;;
      --client|-c|--client-id)
        CLIENT_ID="$2"
        shift 2
        ;;
      --)
        shift
        EXEC_ARGS+=("$@")
        break
        ;;
      *)
        EXEC_ARGS+=("$1")
        shift
        ;;
    esac
  done

  case "$COMMAND" in
    init)
      model_venv_init "$PROVIDER" "$USER_EMAIL" "$CLIENT_ID"
      ;;
    activate)
      echo "To activate run: source \$(model-provider-venv.sh init --provider $PROVIDER --email $USER_EMAIL --client $CLIENT_ID)/activate.sh"
      ;;
    exec)
      model_venv_exec "$PROVIDER" "$USER_EMAIL" "$CLIENT_ID" "${EXEC_ARGS[@]}"
      ;;
    list)
      model_venv_list "$PROVIDER" "$USER_EMAIL"
      ;;
    path)
      model_venv_resolve_root "$PROVIDER" "$USER_EMAIL" "$CLIENT_ID"
      ;;
    *)
      echo "Usage: model-provider-venv.sh <init|exec|list|path> --provider <p> --email <e> [--client <c>] [-- <cmd>]"
      exit 1
      ;;
  esac
fi

