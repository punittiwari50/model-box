#!/usr/bin/env bash
# ==============================================================================
# Antigravity CLI Google OAuth Automation Daemon
# Architecture: OOP Shell Modules, DI, Strict Sanitization, Pure CLI/Shell
# Constraints: Zero Node/Python/Java, YAML Config Driven, No Default Email
# ==============================================================================
set -euo pipefail

# ==============================================================================
# Module: YamlConfigReader (Pure Shell / AWK YAML Parser) & Virtual Environment
# ==============================================================================
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
    local line
    line=$(grep -E "^[[:space:]]*${key}:" "$CONFIG_FILE" 2>/dev/null | head -n 1 || true)
    if [ -n "$line" ]; then
      local val="${line#*:}"
      val="$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      val="${val#\"}"
      val="${val%\"}"
      val="${val#\'}"
      val="${val%\'}"
      if [ -n "$val" ]; then
        echo "$val"
        return 0
      fi
    fi
  fi
  echo "$default_val"
}

# ==============================================================================
# Module: ConfigService (Centralized Static Constants Loaded from YAML)
# ==============================================================================
readonly DATA_DIR="$(read_yaml_value "default_data_dir" "/app/config/data")"
readonly DOWNLOADS_DIR="${DATA_DIR}/downloads"
readonly LOGS_DIR="$(read_yaml_value "default_logs_dir" "${DATA_DIR}/logs")"
readonly CREDENTIALS_DIR="$(read_yaml_value "default_credentials_dir" "${DATA_DIR}/credentials")"
readonly RESPONSES_DIR="$(read_yaml_value "default_responses_dir" "${DATA_DIR}/oauth_responses")"
readonly SYSTEM_BIN_DIR="$(read_yaml_value "system_bin_dir" "/opt/model-connector/bin")"
readonly MODEL_DIR="$(read_yaml_value "default_model_dir" "/opt/model-connector/models")"

readonly JSON_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.json"
readonly CSV_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.csv"
readonly DAEMON_LOG_FILE="${LOGS_DIR}/antigravity_auth_daemon.log"

readonly OAUTH_BASE_URL="$(read_yaml_value "google_base_url" "https://accounts.google.com/o/oauth2/v2/auth")"
readonly OAUTH_URL_REGEX="$(read_yaml_value "google_oauth_url_regex" "https://accounts\.google\.com/o/oauth2/[^[:space:]'\"]+")"
[ -z "${DATETIME_PATTERN:-}" ] && readonly DATETIME_PATTERN="$(read_yaml_value "datetime_pattern" "%Y-%m-%dT%H:%M:%SZ")"
[ -z "${BACKEND_API_URL:-}" ] && readonly BACKEND_API_URL="$(read_yaml_value "backend_api_url" "http://localhost:8095/api/v1")"

readonly DOWNLOAD_URL="https://github.com/google-antigravity/antigravity-cli/releases/download/1.4.12/agy_cli_linux_x64.tar.gz"
readonly ARCHIVE_FILENAME="agy_cli_linux_x64.tar.gz"
readonly ARCHIVE_LOCAL_PATH="${DOWNLOADS_DIR}/${ARCHIVE_FILENAME}"
readonly BINARY_NAME="antigravity"
readonly TARGET_BINARY_PATH="${SYSTEM_BIN_DIR}/${BINARY_NAME}"
readonly TARGET_SYMLINK_PATH="${SYSTEM_BIN_DIR}/agy"

FIFO_IN="/tmp/antigravity_auth_in.fifo"
CLI_LOG="/tmp/antigravity_auth_out.log"
CODE_FILE="/tmp/antigravity_auth_code.txt"
PID_FILE="/tmp/antigravity_auth.pid"
DAEMON_PID_FILE="/tmp/antigravity_auth_daemon.pid"
LOCK_FILE="/tmp/antigravity_auth.lock"

readonly DEFAULT_PROVIDER="google"
MODEL_ID="${MODEL_ID:-gemini-3.8-flash}"
readonly AUTH_MODE_LABEL="1. Google OAuth"
readonly REDACTION_MASK="***REDACTED***"
readonly AUTH_TIMEOUT_SECONDS="${AUTH_TIMEOUT_SECONDS:-300}"
readonly MENU_WAIT_TIMEOUT=20
readonly URL_DISCOVERY_TIMEOUT=40

RESOLVED_CLI_BIN=""
USER_EMAIL=""
CLIENT_ID="default"
SESSION_ID="${SESSION_ID:-}"
IS_STARTUP=false

# ==============================================================================
# Module: LoggerService (Pure Shell Dual Stream & Sensitive Leak Prevention)
# ==============================================================================
sanitize_log_message() {
  local raw="$1"
  echo "$raw" | sed \
    -e 's/client_id=[^& "'\'']*/client_id='"${REDACTION_MASK}"'/g' \
    -e 's/client_secret=[^& "'\'']*/client_secret='"${REDACTION_MASK}"'/g' \
    -e 's/code_challenge=[^& "'\'']*/code_challenge='"${REDACTION_MASK}"'/g' \
    -e 's/state=[^& "'\'']*/state='"${REDACTION_MASK}"'/g' \
    -e 's/auth_code=[^& "'\'']*/auth_code='"${REDACTION_MASK}"'/g' \
    -e 's/"clientId":"[^"]*"/"clientId":"'"${REDACTION_MASK}"'"/g' \
    -e 's/"clientSecret":"[^"]*"/"clientSecret":"'"${REDACTION_MASK}"'"/g' \
    -e 's/"authCode":"[^"]*"/"authCode":"'"${REDACTION_MASK}"'"/g'
}

log_message() {
  local level="$1"; shift
  local msg="$*"
  local sanitized
  sanitized=$(sanitize_log_message "$msg")
  local ts
  ts=$(date -u +"${DATETIME_PATTERN}" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local json_line="{\"timestamp\":\"$ts\",\"level\":\"$level\",\"service\":\"antigravity-auth-daemon\",\"pid\":$$,\"message\":\"$sanitized\"}"
  echo "$json_line" >&2
  if [ -d "$LOGS_DIR" ]; then
    echo "$json_line" >> "$DAEMON_LOG_FILE" 2>/dev/null || true
  fi
}

logger_info() { log_message "INFO" "$@"; }
logger_warn() { log_message "WARN" "$@"; }
logger_error() { log_message "ERROR" "$@"; }

# ==============================================================================
# Module: CleanupService (Resource Disposal)
# ==============================================================================
cleanup() {
  logger_info "Initiating daemon shutdown and resource cleanup..."
  if [ -f "$PID_FILE" ]; then
    local cpid
    cpid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$cpid" ] && kill -0 "$cpid" 2>/dev/null; then
      kill -TERM "$cpid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$cpid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  exec 3>&- 2>/dev/null || true
  rm -f "$FIFO_IN" "$CLI_LOG" "$CODE_FILE" "$DAEMON_PID_FILE" "$LOCK_FILE"
  logger_info "Daemon cleanup completed."
}
trap cleanup EXIT INT TERM HUP

# ==============================================================================
# Module: PreValidationService (Fail-Fast Verification & Strict Email Check)
# ==============================================================================
pre_validate_environment() {
  logger_info "Running pre-flight environment validations..."

  # 1. Require user email strictly from argument - Zero default fallback!
  if [ -z "$USER_EMAIL" ]; then
    logger_error "Pre-validation failed: User email must be provided via argument (--email <user@domain.com>). Default fallback prohibited."
    return 1
  fi
  if ! echo "$USER_EMAIL" | grep -Eq '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
    logger_error "Pre-validation failed: Invalid user email format '${USER_EMAIL}'."
    return 1
  fi

  # 2. Validate required system utilities (Pure shell tools, no node/python)
  local required_tools=("tar" "curl" "script" "mkfifo" "sed" "awk" "grep")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      logger_error "Pre-validation failed: Required utility '${tool}' is not available."
      return 1
    fi
  done

  # 3. Launch & Activate Model Provider Virtual Environment (modenv)
  # Provides isolated Home, Config, IPC FIFO/Lock per User & Client mapping (like nvm / pyenv)
  if command -v model_venv_activate >/dev/null 2>&1; then
    model_venv_activate "$DEFAULT_PROVIDER" "$USER_EMAIL" "$CLIENT_ID"
    FIFO_IN="${VENV_FIFO_IN}"
    CLI_LOG="${VENV_CLI_LOG}"
    CODE_FILE="${VENV_CODE_FILE}"
    PID_FILE="${VENV_PID_FILE}"
    DAEMON_PID_FILE="${MODEL_VENV_PATH}/run/daemon.pid"
    LOCK_FILE="${VENV_LOCK_FILE}"
    logger_info "Activated isolated virtual environment: ${MODEL_VENV_PATH}"

    # Resolve active model from virtual environment if not explicitly passed
    if [ -z "${MODEL_ID:-}" ] || [ "$MODEL_ID" = "gemini-3.8-flash" ]; then
      local venv_model
      venv_model=$(model_venv_get_model "$DEFAULT_PROVIDER" "$USER_EMAIL" "$CLIENT_ID" 2>/dev/null | grep -o '"activeModel":"[^"]*' | cut -d'"' -f4 || echo "")
      if [ -n "$venv_model" ]; then
        MODEL_ID="$venv_model"
      fi
    fi
  fi

  # 4. Validate / create directory structure in bidirectional volume
  local required_dirs=("$DATA_DIR" "$DOWNLOADS_DIR" "$LOGS_DIR" "$CREDENTIALS_DIR" "$RESPONSES_DIR" "$SYSTEM_BIN_DIR" "$MODEL_DIR")
  for dir in "${required_dirs[@]}"; do
    if [ ! -d "$dir" ]; then
      mkdir -p "$dir" || {
        logger_error "Pre-validation failed: Unable to create directory '${dir}'."
        return 1
      }
    fi
    if [ ! -w "$dir" ]; then
      logger_error "Pre-validation failed: Directory '${dir}' is not writable."
      return 1
    fi
  done

  # 5. Check isolated daemon instance concurrency per virtual environment
  if [ -f "$LOCK_FILE" ]; then
    local old_pid
    old_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      logger_warn "Daemon already active in virtualenv under PID ${old_pid}. Terminating duplicate invocation."
      exit 0
    fi
  fi
  echo $$ > "$LOCK_FILE"
  echo $$ > "$DAEMON_PID_FILE"

  logger_info "Pre-flight validations succeeded for user principal: ${USER_EMAIL}"
  return 0
}

# ==============================================================================
# Module: BinaryDownloadService (Bidirectional Volume Download & Extraction)
# ==============================================================================
resolve_binary() {
  if [ -x "$TARGET_BINARY_PATH" ]; then
    RESOLVED_CLI_BIN="$TARGET_BINARY_PATH"
    return 0
  fi
  if [ -x "/usr/local/bin/antigravity" ]; then
    RESOLVED_CLI_BIN="/usr/local/bin/antigravity"
    return 0
  fi
  if command -v "$BINARY_NAME" >/dev/null 2>&1; then
    RESOLVED_CLI_BIN=$(command -v "$BINARY_NAME")
    return 0
  fi

  if [ ! -f "$ARCHIVE_LOCAL_PATH" ]; then
    logger_info "Downloading Antigravity CLI archive into bidirectional volume: ${ARCHIVE_LOCAL_PATH}..."
    if ! curl -fsSL "$DOWNLOAD_URL" -o "$ARCHIVE_LOCAL_PATH"; then
      logger_error "Failed to download Antigravity CLI from ${DOWNLOAD_URL}"
      return 1
    fi
    chmod 666 "$ARCHIVE_LOCAL_PATH" 2>/dev/null || true
    logger_info "Download complete and preserved in bidirectional volume at: ${ARCHIVE_LOCAL_PATH}"
  fi

  logger_info "Extracting ${ARCHIVE_LOCAL_PATH} to ${SYSTEM_BIN_DIR}..."
  tar -zxvf "$ARCHIVE_LOCAL_PATH" -C "$SYSTEM_BIN_DIR" >/dev/null 2>&1 || true
  chmod +x "$TARGET_BINARY_PATH" 2>/dev/null || true
  ln -sf "$TARGET_BINARY_PATH" "$TARGET_SYMLINK_PATH" 2>/dev/null || true

  if [ -x "$TARGET_BINARY_PATH" ]; then
    RESOLVED_CLI_BIN="$TARGET_BINARY_PATH"
    return 0
  fi
  return 1
}

# ==============================================================================
# Module: PureShellJsonService (Strict Shell Regex & Syntax Validation)
# ==============================================================================
extract_url_param() {
  local url="$1"
  local param="$2"
  echo "$url" | sed -n 's/.*[?&]'"$param"'=\([^&#]*\).*/\1/p' | head -n 1
}

validate_json_syntax() {
  local json_payload="$1"
  if command -v jq >/dev/null 2>&1; then
    echo "$json_payload" | jq empty >/dev/null 2>&1
    return $?
  fi
  [ -n "$json_payload" ] && [[ "$json_payload" =~ ^[[:space:]]*\{.*\} ]]
}

save_session_record() {
  local session_json="$1"
  local session_id="$2"
  local oauth_url="${3:-}"
  local client_id="${4:-}"
  local state="${5:-}"
  local code_challenge="${6:-}"
  local redirect_uri="${7:-}"

  if ! validate_json_syntax "$session_json"; then
    logger_error "JSON syntax validation failed for session payload. Rejecting write."
    return 1
  fi

  local single_session_file="${RESPONSES_DIR}/oauth_session_${session_id}.json"
  echo "$session_json" > "$single_session_file"

  # Upsert into master oauth_sessions.json in pure shell/awk
  if [ ! -f "$JSON_SESSIONS_FILE" ]; then
    echo "{\"version\":\"1.0\",\"updatedAt\":\"$(date -u +"${DATETIME_PATTERN}")\",\"latestSessionId\":\"${session_id}\",\"sessions\":[${session_json}]}" > "$JSON_SESSIONS_FILE"
  else
    if command -v jq >/dev/null 2>&1; then
      local tmp="${JSON_SESSIONS_FILE}.tmp"
      jq --argjson newS "$session_json" \
         --arg sid "$session_id" \
         --arg ts "$(date -u +"${DATETIME_PATTERN}")" \
         '.updatedAt = $ts | .latestSessionId = $sid | .sessions = [$newS] + [.sessions[] | select(.sessionId != $sid)]' \
         "$JSON_SESSIONS_FILE" > "$tmp" 2>/dev/null && mv "$tmp" "$JSON_SESSIONS_FILE" || true
    fi
  fi

  # CSV append for tabular review matching full 13-column schema
  if [ ! -f "$CSV_SESSIONS_FILE" ]; then
    echo "SESSION_ID,PROVIDER,MODEL_ID,AUTH_MODE,OAUTH_URL,CLIENT_ID,STATE,CODE_CHALLENGE,REDIRECT_URI,AUTH_CODE,STATUS,CREATED_AT,UPDATED_AT" > "$CSV_SESSIONS_FILE"
  fi
  local now_ts
  now_ts="$(date -u +"${DATETIME_PATTERN}")"
  echo "\"${session_id}\",\"${DEFAULT_PROVIDER}\",\"${MODEL_ID}\",\"${AUTH_MODE_LABEL}\",\"${oauth_url}\",\"${client_id}\",\"${state}\",\"${code_challenge}\",\"${redirect_uri}\",\"\",\"PENDING\",\"${now_ts}\",\"${now_ts}\"" >> "$CSV_SESSIONS_FILE"

  logger_info "Saved OAuth session [${session_id}] for user [${USER_EMAIL}] to bidirectional volume."
  return 0
}

# ==============================================================================
# Module: LocalVcsCommitService & DatabaseRecordSync (Pure Shell via REST API)
# ==============================================================================
commit_and_push_to_database() {
  local status="$1"
  local session_id="$2"
  local error_msg="${3:-}"
  local oauth_url="${4:-}"
  local client_id="${5:-}"
  local state="${6:-}"
  local code_challenge="${7:-}"
  local redirect_uri="${8:-}"

  # 1. Pure in-container Git commit in CREDENTIALS_DIR
  if [ ! -d "${CREDENTIALS_DIR}/.git" ]; then
    git -C "$CREDENTIALS_DIR" init -q 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.name "ModelBox Platform" 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.email "daemon@modelbox.internal" 2>/dev/null || true
  fi

  local commit_msg="auth(${status,,}): user=${USER_EMAIL} provider=${DEFAULT_PROVIDER} model=${MODEL_ID} session=${session_id}"
  if [ -n "$error_msg" ]; then
    commit_msg="${commit_msg} error=${error_msg}"
  fi

  git -C "$CREDENTIALS_DIR" add -A 2>/dev/null || true
  git -C "$CREDENTIALS_DIR" commit --allow-empty -q -m "$commit_msg" 2>/dev/null || true
  local commit_id
  commit_id=$(git -C "$CREDENTIALS_DIR" rev-parse HEAD 2>/dev/null || echo "commit-local")

  logger_info "Git commit created in credentials directory: [${commit_id:0:7}] ${commit_msg}"

  # 2. Push both authentication and conversation files to database via REST API
  push_session_to_database "$status" "$session_id" "$commit_id" "$error_msg" "$oauth_url" "$client_id" "$state" "$code_challenge" "$redirect_uri"
}

push_session_to_database() {
  local status="$1"
  local session_id="$2"
  local commit_id="$3"
  local error_msg="${4:-}"
  local oauth_url="${5:-}"
  local client_id="${6:-}"
  local state="${7:-}"
  local code_challenge="${8:-}"
  local redirect_uri="${9:-}"
  local api_url="${BACKEND_API_URL}/auth/cli-session/sync"

  logger_info "Pushing authentication and conversation details to database via REST API..."

  local auth_file="${RESPONSES_DIR}/oauth_session_${session_id}.json"
  local auth_content=""
  if [ -f "$auth_file" ]; then
    auth_content=$(cat "$auth_file" 2>/dev/null | tr -d '\r\n' | sed 's/"/\\"/g' || true)
    if [ -z "$oauth_url" ]; then
      oauth_url=$(grep -o '"oauthUrl": *"[^"]*"' "$auth_file" 2>/dev/null | cut -d'"' -f4 || true)
    fi
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
  "oauthUrl": "$oauth_url",
  "clientId": "$client_id",
  "state": "$state",
  "codeChallenge": "$code_challenge",
  "redirectUri": "$redirect_uri",
  "cliRedirectUri": "$redirect_uri",
  "appRedirectUri": "http://localhost:8085/oauth2callback",
  "authFileContent": "$auth_content"
}
EOF
)

  local response
  response=$(curl -s -X POST "$api_url" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --max-time 10 2>/dev/null || echo '{"success":false,"message":"REST API call timed out"}')

  logger_info "Database synchronization response: ${response}"
}

# ==============================================================================
# Module: PtyProcessManager & DaemonEngine (Orchestration Loop in Pure Shell)
# ==============================================================================
run_oauth_daemon() {
  local cli_bin="$1"

  rm -f "$FIFO_IN" "$CLI_LOG" "$CODE_FILE"
  mkfifo "$FIFO_IN"
  exec 3<> "$FIFO_IN"

  logger_info "Spawning Antigravity CLI process for user ${USER_EMAIL}..."
  COLUMNS=2000 LINES=100 script -q -c "${cli_bin}" /dev/null < "$FIFO_IN" > "$CLI_LOG" 2>&1 &
  local cli_pid=$!
  echo "$cli_pid" > "$PID_FILE"
  logger_info "Antigravity CLI process launched with PID: ${cli_pid}"

  # Wait for login method prompt and confirm Option 1: Google OAuth
  local selected_option=false
  for ((i=1; i<=MENU_WAIT_TIMEOUT; i++)); do
    if [ -f "$CLI_LOG" ] && grep -qi "Select login method" "$CLI_LOG"; then
      logger_info "Detected interactive login menu. Transmitting newline for '${AUTH_MODE_LABEL}'..."
      printf '\r\n' >&3
      selected_option=true
      break
    fi
    sleep 0.2
  done

  if [ "$selected_option" = false ]; then
    logger_info "Menu timer elapsed. Transmitting newline to confirm Option 1..."
    printf '\r\n' >&3
  fi

  # Extract Google OAuth URL using pure shell / grep regex
  local oauth_url=""
  local clean_regex="${OAUTH_URL_REGEX//\\\\/\\}"
  for ((i=1; i<=URL_DISCOVERY_TIMEOUT; i++)); do
    if [ -f "$CLI_LOG" ]; then
      oauth_url=$(grep -oE "$clean_regex" "$CLI_LOG" 2>/dev/null | head -n 1 || true)
      if [ -n "$oauth_url" ]; then break; fi
    fi
    sleep 0.5
  done

  local session_id="${SESSION_ID:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)}"

  if [ -z "$oauth_url" ]; then
    logger_warn "No Google OAuth authorization URL captured within timeout."
    commit_and_push_to_database "FAILED" "$session_id" "URL_DISCOVERY_TIMEOUT"
    return 0
  fi

  logger_info "Captured Google OAuth Authorization URL via pure shell regex."

  local now
  now=$(date -u +"${DATETIME_PATTERN}" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

  local client_id state code_challenge redirect_uri
  client_id=$(extract_url_param "$oauth_url" "client_id")
  state=$(extract_url_param "$oauth_url" "state")
  code_challenge=$(extract_url_param "$oauth_url" "code_challenge")
  redirect_uri=$(extract_url_param "$oauth_url" "redirect_uri")

  local session_json
  session_json=$(cat <<EOF
{
  "sessionId": "$session_id",
  "provider": "$DEFAULT_PROVIDER",
  "modelId": "$MODEL_ID",
  "authMode": "$AUTH_MODE_LABEL",
  "oauthUrl": "$oauth_url",
  "clientId": "$client_id",
  "state": "$state",
  "codeChallenge": "$code_challenge",
  "redirectUri": "$redirect_uri",
  "cliRedirectUri": "$redirect_uri",
  "appRedirectUri": "http://localhost:8085/oauth2callback",
  "authCode": "",
  "userEmail": "$USER_EMAIL",
  "status": "PENDING",
  "createdAt": "$now",
  "updatedAt": "$now"
}
EOF
)

  save_session_record "$session_json" "$session_id" "$oauth_url" "$client_id" "$state" "$code_challenge" "$redirect_uri"
  push_session_to_database "PENDING" "$session_id" "" "" "$oauth_url" "$client_id" "$state" "$code_challenge" "$redirect_uri"

  # Await authcode from user callback
  logger_info "Waiting for user authorization code input (timeout: ${AUTH_TIMEOUT_SECONDS}s)..."
  local code_received=false
  for ((s=0; s<AUTH_TIMEOUT_SECONDS; s+=2)); do
    if ! kill -0 "$cli_pid" 2>/dev/null; then
      logger_info "CLI process ${cli_pid} finished. Terminating daemon waiting loop."
      break
    fi

    local detected_code_file=""
    if [ -f "$CODE_FILE" ]; then
      detected_code_file="$CODE_FILE"
    elif [ -f "/tmp/antigravity_auth_code.txt" ]; then
      detected_code_file="/tmp/antigravity_auth_code.txt"
    elif [ -f "/tmp/gemini_auth_code.txt" ]; then
      detected_code_file="/tmp/gemini_auth_code.txt"
    elif [ -f "/tmp/google_auth_code.txt" ]; then
      detected_code_file="/tmp/google_auth_code.txt"
    fi

    if [ -n "$detected_code_file" ]; then
      local auth_code
      auth_code=$(cat "$detected_code_file" 2>/dev/null | tr -d '\r\n[:space:]')
      if [ -n "$auth_code" ]; then
        logger_info "Authorization code received from [${detected_code_file}]! Transmitting to Antigravity CLI stdin..."
        printf "%s\r\n" "$auth_code" >&3
        rm -f "$CODE_FILE" "/tmp/antigravity_auth_code.txt" "/tmp/gemini_auth_code.txt" "/tmp/google_auth_code.txt" 2>/dev/null || true

        sleep 4
        if [ -d "$HOME/.config/antigravity" ]; then
          cp -rf "$HOME/.config/antigravity"/* "$CREDENTIALS_DIR/" 2>/dev/null || true
        fi
        if [ -d "$HOME/.gemini" ]; then
          cp -rf "$HOME/.gemini"/* "$CREDENTIALS_DIR/" 2>/dev/null || true
        fi

        commit_and_push_to_database "COMPLETED" "$session_id" ""
        code_received=true
        break
      fi
    fi
    sleep 2
  done

  if [ "$code_received" = false ]; then
    logger_error "OAuth CLI authentication timed out after ${AUTH_TIMEOUT_SECONDS}s. User did not provide authorization code."
    if kill -0 "$cli_pid" 2>/dev/null; then
      kill -TERM "$cli_pid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$cli_pid" 2>/dev/null || true
    fi
    commit_and_push_to_database "FAILED" "$session_id" "CLI_TIMEOUT_300S: Authorization code was not provided within the 300-second window."
  fi

  logger_info "Antigravity OAuth daemon session closed."
}

# ==============================================================================
# Argument Parsing: Strict Email Enforcement & Dispatch
# ==============================================================================
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
      --session-id|-s)
        SESSION_ID="${2:-}"
        shift 2
        ;;
      --session-id=*)
        SESSION_ID="${1#*=}"
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

  # Also check environment variable if explicitly exported by caller
  if [ -z "$USER_EMAIL" ] && [ -n "${USER_EMAIL_ARG:-}" ]; then
    USER_EMAIL="$USER_EMAIL_ARG"
  fi
}

main() {
  parse_args "$@"
  if [ "$IS_STARTUP" = "true" ] && [ -z "$USER_EMAIL" ]; then
    logger_info "Container boot: No user email provided at startup. Daemon ready for on-demand invocation."
    exit 0
  fi
  pre_validate_environment
  resolve_binary
  if [ -z "$RESOLVED_CLI_BIN" ] || [ ! -x "$RESOLVED_CLI_BIN" ]; then
    logger_error "Failed to discover or extract Antigravity CLI binary."
    exit 1
  fi
  logger_info "Discovered Antigravity CLI binary at: ${RESOLVED_CLI_BIN}"
  run_oauth_daemon "$RESOLVED_CLI_BIN"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
