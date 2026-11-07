#!/usr/bin/env bash
# ==============================================================================
# OpenAI ChatGPT / Codex CLI OAuth Automation Daemon
# Architecture: OOP Shell Modules, DI, Strict Sanitization, Pure CLI/Shell
# Constraints: Zero Node/Python/Java, YAML Config Driven, No Default Email
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/auth-config.yml"

# Source Model Provider Virtual Environment Manager
if [ -f "${SCRIPT_DIR}/model-provider-venv.sh" ]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/model-provider-venv.sh"
fi

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

readonly DATA_DIR="$(read_yaml_value "default_data_dir" "/app/config/data")"
readonly LOGS_DIR="$(read_yaml_value "default_logs_dir" "${DATA_DIR}/logs")"
readonly CREDENTIALS_DIR="$(read_yaml_value "default_credentials_dir" "${DATA_DIR}/credentials")"
readonly RESPONSES_DIR="$(read_yaml_value "default_responses_dir" "${DATA_DIR}/oauth_responses")"
readonly JSON_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.json"
readonly CSV_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.csv"
readonly DAEMON_LOG_FILE="${LOGS_DIR}/chatgpt_auth_daemon.log"

readonly OAUTH_BASE_URL="$(read_yaml_value "openai_base_url" "https://auth0.openai.com/authorize")"
[ -z "${DATETIME_PATTERN:-}" ] && readonly DATETIME_PATTERN="$(read_yaml_value "datetime_pattern" "%Y-%m-%dT%H:%M:%SZ")"
[ -z "${BACKEND_API_URL:-}" ] && readonly BACKEND_API_URL="$(read_yaml_value "backend_api_url" "http://localhost:8095/api/v1")"

readonly BINARY_NAME="chatgpt"
readonly DEFAULT_PROVIDER="openai"
MODEL_ID="${MODEL_ID:-gpt-4o}"
readonly AUTH_MODE_LABEL="OpenAI ChatGPT CLI OAuth"
readonly REDACTION_MASK="***REDACTED***"
readonly APP_REDIRECT_URI="http://localhost:8085/oauth2callback"
readonly AUTH_TIMEOUT_SECONDS="${AUTH_TIMEOUT_SECONDS:-300}"

FIFO_IN="/tmp/chatgpt_auth_in.fifo"
CLI_LOG="/tmp/chatgpt_auth_out.log"
CODE_FILE="/tmp/chatgpt_auth_code.txt"
PID_FILE="/tmp/chatgpt_auth.pid"
LOCK_FILE="/tmp/chatgpt_auth.lock"

USER_EMAIL=""
CLIENT_ID="default"
IS_STARTUP=false

sanitize_log_message() {
  local raw="$1"
  echo "$raw" | sed \
    -e 's/client_id=[^& "'\'']*/client_id='"${REDACTION_MASK}"'/g' \
    -e 's/client_secret=[^& "'\'']*/client_secret='"${REDACTION_MASK}"'/g' \
    -e 's/code_challenge=[^& "'\'']*/code_challenge='"${REDACTION_MASK}"'/g' \
    -e 's/state=[^& "'\'']*/state='"${REDACTION_MASK}"'/g' \
    -e 's/auth_code=[^& "'\'']*/auth_code='"${REDACTION_MASK}"'/g'
}

log_message() {
  local level="$1"; shift
  local msg="$*"
  local sanitized
  sanitized=$(sanitize_log_message "$msg")
  local ts
  ts=$(date -u +"${DATETIME_PATTERN}" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local json_line="{\"timestamp\":\"$ts\",\"level\":\"$level\",\"service\":\"chatgpt-auth-daemon\",\"pid\":$$,\"message\":\"$sanitized\"}"
  echo "$json_line" >&2
  if [ -d "$LOGS_DIR" ]; then
    echo "$json_line" >> "$DAEMON_LOG_FILE" 2>/dev/null || true
  fi
}

logger_info() { log_message "INFO" "$@"; }
logger_warn() { log_message "WARN" "$@"; }
logger_error() { log_message "ERROR" "$@"; }

pre_validate() {
  if [ -z "$USER_EMAIL" ]; then
    logger_error "Pre-validation failed: User email must be provided via argument (--email <user@domain.com>). Default fallback prohibited."
    return 1
  fi
  if ! echo "$USER_EMAIL" | grep -Eq '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
    logger_error "Pre-validation failed: Invalid user email format '${USER_EMAIL}'."
    return 1
  fi

  # Launch & Activate Isolated Virtual Environment for OpenAI ChatGPT / Codex
  if command -v model_venv_activate >/dev/null 2>&1; then
    model_venv_activate "$DEFAULT_PROVIDER" "$USER_EMAIL" "$CLIENT_ID"
    FIFO_IN="${VENV_FIFO_IN}"
    CLI_LOG="${VENV_CLI_LOG}"
    CODE_FILE="${VENV_CODE_FILE}"
    PID_FILE="${VENV_PID_FILE}"
    LOCK_FILE="${VENV_LOCK_FILE}"
    logger_info "Activated ChatGPT isolated virtual environment: ${MODEL_VENV_PATH}"

    if [ -z "${MODEL_ID:-}" ] || [ "$MODEL_ID" = "gpt-4o" ]; then
      local venv_model
      venv_model=$(model_venv_get_model "$DEFAULT_PROVIDER" "$USER_EMAIL" "$CLIENT_ID" 2>/dev/null | grep -o '"activeModel":"[^"]*' | cut -d'"' -f4 || echo "")
      if [ -n "$venv_model" ]; then
        MODEL_ID="$venv_model"
      fi
    fi
  fi

  mkdir -p "$DATA_DIR" "$LOGS_DIR" "$CREDENTIALS_DIR" "$RESPONSES_DIR"
  logger_info "Pre-validation succeeded for user: ${USER_EMAIL}"
  return 0
}

save_session() {
  local session_json="$1"
  local session_id="$2"
  local s_file="${RESPONSES_DIR}/oauth_session_${session_id}.json"
  echo "$session_json" > "$s_file"

  if [ ! -f "$JSON_SESSIONS_FILE" ]; then
    echo "{\"version\":\"1.0\",\"updatedAt\":\"$(date -u +"${DATETIME_PATTERN}")\",\"latestSessionId\":\"${session_id}\",\"sessions\":[${session_json}]}" > "$JSON_SESSIONS_FILE"
  fi
}

push_auth_and_conversation_to_db() {
  local status="$1"
  local session_id="$2"
  local error_msg="${3:-}"

  git config --global --add safe.directory "$CREDENTIALS_DIR" 2>/dev/null || true
  if [ ! -d "${CREDENTIALS_DIR}/.git" ]; then
    git -C "$CREDENTIALS_DIR" init -q 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.name "ModelBox Bot" 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.email "bot@modelbox.local" 2>/dev/null || true
  fi

  local commit_msg="auth(${status,,}): user=${USER_EMAIL} provider=${DEFAULT_PROVIDER} model=${MODEL_ID} session=${session_id}"
  if [ -n "$error_msg" ]; then
    commit_msg="${commit_msg} error=${error_msg}"
  fi

  git -C "$CREDENTIALS_DIR" add -A 2>/dev/null || true
  git -C "$CREDENTIALS_DIR" commit --allow-empty -q -m "$commit_msg" 2>/dev/null || true
  local commit_id
  commit_id=$(git -C "$CREDENTIALS_DIR" rev-parse HEAD 2>/dev/null || echo "commit-local")

  local auth_file="${RESPONSES_DIR}/oauth_session_${session_id}.json"
  local auth_content=""
  if [ -f "$auth_file" ]; then
    auth_content=$(cat "$auth_file" 2>/dev/null | tr -d '\r\n' | sed 's/"/\\"/g' || true)
  fi

  local payload
  payload=$(cat <<EOF
{
  "sessionId": "$session_id",
  "provider": "$DEFAULT_PROVIDER",
  "modelId": "$MODEL_ID",
  "status": "$status",
  "userEmail": "$USER_EMAIL",
  "commitId": "$commit_id",
  "errorMessage": "$error_msg",
  "authFileContent": "$auth_content"
}
EOF
)

  curl -s -X POST "${BACKEND_API_URL}/auth/cli-session/sync" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --max-time 10 2>/dev/null || true

  logger_info "Pushed authentication and conversation record for ${USER_EMAIL} to database."
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --startup)
        IS_STARTUP=true
        shift
        ;;
      --email|-e)
        USER_EMAIL="${2:-}"
        shift 2
        ;;
      --email=*)
        USER_EMAIL="${1#*=}"
        shift
        ;;
      --client|-c|--client-id)
        CLIENT_ID="${2:-default}"
        shift 2
        ;;
      --client=*|--client-id=*)
        CLIENT_ID="${1#*=}"
        shift
        ;;
      --model|-m|--model-id)
        MODEL_ID="${2:-}"
        shift 2
        ;;
      --model=*|--model-id=*)
        MODEL_ID="${1#*=}"
        shift
        ;;
      *)
        if [ -z "$USER_EMAIL" ] && [[ "$1" =~ @ ]]; then
          USER_EMAIL="$1"
        fi
        shift
        ;;
    esac
  done

  if [ -z "$USER_EMAIL" ] && [ -n "${USER_EMAIL_ARG:-}" ]; then
    USER_EMAIL="$USER_EMAIL_ARG"
  fi
}

main() {
  parse_args "$@"
  if [ "$IS_STARTUP" = "true" ] && [ -z "$USER_EMAIL" ]; then
    logger_info "Container boot: No user email provided at startup. Ready for on-demand invocation."
    exit 0
  fi
  pre_validate
  logger_info "Initiating OpenAI ChatGPT CLI Authentication for user ${USER_EMAIL}..."
  local session_id
  session_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)
  local now
  now=$(date -u +"${DATETIME_PATTERN}" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local state
  state=$(tr -dc 'a-f0-9' < /dev/urandom 2>/dev/null | head -c 32 || date +%s%N)

  local oauth_url="${OAUTH_BASE_URL}?client_id=openai-chatgpt-cli&response_type=code&redirect_uri=${APP_REDIRECT_URI}&state=${state}&scope=openid%20profile%20email%20model.request"

  local session_json
  session_json=$(cat <<EOF
{
  "sessionId": "$session_id",
  "provider": "$DEFAULT_PROVIDER",
  "modelId": "$MODEL_ID",
  "authMode": "$AUTH_MODE_LABEL",
  "oauthUrl": "$oauth_url",
  "clientId": "openai-chatgpt-cli",
  "state": "$state",
  "redirectUri": "$APP_REDIRECT_URI",
  "cliRedirectUri": "https://chatgpt.com/oauth-callback",
  "appRedirectUri": "$APP_REDIRECT_URI",
  "authCode": "",
  "userEmail": "$USER_EMAIL",
  "status": "PENDING",
  "createdAt": "$now",
  "updatedAt": "$now"
}
EOF
)

  save_session "$session_json" "$session_id"
  push_auth_and_conversation_to_db "PENDING" "$session_id" ""

  rm -f "$FIFO_IN" "$CODE_FILE"
  mkfifo "$FIFO_IN"
  exec 3<> "$FIFO_IN"

  local auth_succeeded=false
  for ((s=0; s<AUTH_TIMEOUT_SECONDS; s+=2)); do
    if [ -f "$CODE_FILE" ]; then
      local code
      code=$(cat "$CODE_FILE" 2>/dev/null | tr -d '\r\n[:space:]')
      if [ -n "$code" ]; then
        logger_info "Auth code received for ChatGPT session [${session_id}]."
        auth_succeeded=true
        push_auth_and_conversation_to_db "COMPLETED" "$session_id" ""
        break
      fi
    fi
    sleep 2
  done

  if [ "$auth_succeeded" = false ]; then
    push_auth_and_conversation_to_db "FAILED" "$session_id" "AUTH_CODE_TIMEOUT"
  fi
  logger_info "ChatGPT auth daemon finished."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
