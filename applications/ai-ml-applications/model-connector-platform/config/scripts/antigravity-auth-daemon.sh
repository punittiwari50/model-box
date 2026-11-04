#!/usr/bin/env bash
# ==============================================================================
# Antigravity CLI Google OAuth Automation Daemon
# Purpose: Non-interactive automation of interactive Antigravity CLI login
# Architecture: PTY loopback execution, non-blocking FIFO, CSV & DB sync
# Standards: STD-COD-002, STD-COD-007, STD-COD-010
# ==============================================================================
set -euo pipefail

DATA_DIR="${DATA_DIR:-/app/config/data}"
LOG_DIR="${DATA_DIR}/logs"
CSV_FILE="${DATA_DIR}/oauth_sessions.csv"
CRED_DIR="${DATA_DIR}/credentials"
RESP_DIR="${DATA_DIR}/oauth_responses"
FIFO_IN="/tmp/antigravity_auth_in.fifo"
CLI_LOG="/tmp/antigravity_auth_out.log"
CODE_FILE="/tmp/antigravity_auth_code.txt"
PID_FILE="/tmp/antigravity_auth.pid"
DAEMON_PID_FILE="/tmp/antigravity_auth_daemon.pid"
LOG_FILE="${LOG_DIR}/antigravity_auth_daemon.log"
LOCK_FILE="/tmp/antigravity_auth.lock"

mkdir -p "$DATA_DIR" "$LOG_DIR" "$CRED_DIR" "$RESP_DIR"

# Ensure single running daemon instance
if [ -f "$LOCK_FILE" ]; then
  OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "{\"timestamp\":\"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\",\"level\":\"WARN\",\"service\":\"antigravity-auth-daemon\",\"pid\":$$,\"message\":\"Daemon already running under PID ${OLD_PID}. Exiting new instance.\"}"
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
echo $$ > "$DAEMON_PID_FILE"

log_msg() {
  local level="$1"; shift
  local msg="$*"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local json_line="{\"timestamp\":\"$ts\",\"level\":\"$level\",\"service\":\"antigravity-auth-daemon\",\"pid\":$$,\"message\":\"$msg\"}"
  echo "$json_line"
  echo "$json_line" >> "$LOG_FILE" 2>/dev/null || true
}

cleanup() {
  log_msg "INFO" "Executing daemon termination cleanup..."
  if [ -f "$PID_FILE" ]; then
    local cpid
    cpid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$cpid" ] && kill -0 "$cpid" 2>/dev/null; then
      kill -TERM "$cpid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  exec 3>&- 2>/dev/null || true
  rm -f "$FIFO_IN" "$CLI_LOG" "$CODE_FILE" "$DAEMON_PID_FILE" "$LOCK_FILE"
}
trap cleanup EXIT INT TERM

# Binary discovery
find_binary() {
  if command -v antigravity >/dev/null 2>&1; then
    echo "antigravity"
    return 0
  fi
  if [ -x "/usr/local/bin/antigravity" ]; then
    echo "/usr/local/bin/antigravity"
    return 0
  fi
  if [ -x "/home/node/.local/bin/agy" ]; then
    echo "/home/node/.local/bin/agy"
    return 0
  fi
  if [ -f "/app/agy_cli_linux_x64.tar.gz" ]; then
    log_msg "INFO" "Unpacking /app/agy_cli_linux_x64.tar.gz..."
    tar -zxvf /app/agy_cli_linux_x64.tar.gz -C /usr/local/bin/ >/dev/null 2>&1 || true
    chmod +x /usr/local/bin/antigravity 2>/dev/null || true
    ln -sf /usr/local/bin/antigravity /usr/local/bin/agy 2>/dev/null || true
    echo "/usr/local/bin/antigravity"
    return 0
  fi
  return 1
}

CLI_BIN=$(find_binary || true)
if [ -z "$CLI_BIN" ]; then
  log_msg "ERROR" "Antigravity CLI binary could not be found."
  exit 1
fi
log_msg "INFO" "Discovered Antigravity CLI binary at: ${CLI_BIN}"

# Initialize CSV file with canonical headers if missing
if [ ! -f "$CSV_FILE" ]; then
  log_msg "INFO" "Initializing OAuth sessions CSV at: ${CSV_FILE}"
  echo "SESSION_ID,PROVIDER,MODEL_ID,AUTH_MODE,OAUTH_URL,CLIENT_ID,STATE,CODE_CHALLENGE,REDIRECT_URI,AUTH_CODE,STATUS,CREATED_AT,UPDATED_AT" > "$CSV_FILE"
  chmod 666 "$CSV_FILE" 2>/dev/null || true
fi

# Prepare named FIFO
rm -f "$FIFO_IN" "$CLI_LOG" "$CODE_FILE"
mkfifo "$FIFO_IN"
exec 3<> "$FIFO_IN"

log_msg "INFO" "Starting Antigravity CLI in pseudo-terminal mode..."
COLUMNS=2000 LINES=100 script -q -c "${CLI_BIN}" /dev/null < "$FIFO_IN" > "$CLI_LOG" 2>&1 &
CLI_PID=$!
echo "$CLI_PID" > "$PID_FILE"
log_msg "INFO" "Antigravity CLI process spawned with PID: ${CLI_PID}"

# Wait for 'Select login method:' prompt and send Enter to select 'Option 1: Google OAuth'
SELECTED_OPTION=false
for i in $(seq 1 20); do
  if [ -f "$CLI_LOG" ] && grep -qi "Select login method" "$CLI_LOG"; then
    log_msg "INFO" "Detected login method menu. Selecting '1. Google OAuth'..."
    printf '\r\n' > "$FIFO_IN"
    SELECTED_OPTION=true
    break
  fi
  sleep 0.2
done

# If menu was not explicitly detected after 4s, send Enter newline to confirm Option 1
if [ "$SELECTED_OPTION" = false ]; then
  log_msg "INFO" "Sending default selection newline to select Option 1: Google OAuth..."
  printf '\r\n' > "$FIFO_IN"
fi

# Wait and extract OAuth URL from output
OAUTH_URL=""
for i in $(seq 1 40); do
  if [ -f "$CLI_LOG" ]; then
    OAUTH_URL=$(node -e "
      const fs = require('fs');
      try {
        const text = fs.readFileSync('${CLI_LOG}', 'utf8');
        const m = text.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s\r\n]+/);
        if (m) console.log(m[0].trim());
      } catch (e) {}
    " 2>/dev/null || true)
    if [ -n "$OAUTH_URL" ]; then
      break
    fi
  fi
  sleep 0.5
done

if [ -z "$OAUTH_URL" ]; then
  log_msg "WARN" "No Google OAuth URL detected within timeout. CLI may already be authenticated or encountered an error."
  exit 0
fi

log_msg "INFO" "Captured Google OAuth Authorization URL successfully."

# Extract parameters using Node.js for reliable parsing and unescaping
PARSED_JSON=$(node -e "
  try {
    const rawUrl = process.argv[1];
    const u = new URL(rawUrl);
    const result = {
      url: u.href,
      clientId: u.searchParams.get('client_id') || '',
      state: u.searchParams.get('state') || '',
      codeChallenge: u.searchParams.get('code_challenge') || '',
      redirectUri: u.searchParams.get('redirect_uri') || ''
    };
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log('{}');
  }
" "$OAUTH_URL" 2>/dev/null)

CLIENT_ID=$(echo "$PARSED_JSON" | node -e "const stdin = require('fs').readFileSync(0, 'utf-8'); console.log(JSON.parse(stdin).clientId || '');" 2>/dev/null || echo "")
STATE=$(echo "$PARSED_JSON" | node -e "const stdin = require('fs').readFileSync(0, 'utf-8'); console.log(JSON.parse(stdin).state || '');" 2>/dev/null || echo "")
CODE_CHALLENGE=$(echo "$PARSED_JSON" | node -e "const stdin = require('fs').readFileSync(0, 'utf-8'); console.log(JSON.parse(stdin).codeChallenge || '');" 2>/dev/null || echo "")
REDIRECT_URI=$(echo "$PARSED_JSON" | node -e "const stdin = require('fs').readFileSync(0, 'utf-8'); console.log(JSON.parse(stdin).redirectUri || '');" 2>/dev/null || echo "")

SESSION_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

# Idempotent CSV persistence (check non-empty state match)
ALREADY_EXISTS=false
if [ -n "$STATE" ] && [ -f "$CSV_FILE" ]; then
  if grep -q "\"${STATE}\"" "$CSV_FILE" 2>/dev/null || grep -q ",${STATE}," "$CSV_FILE" 2>/dev/null; then
    ALREADY_EXISTS=true
  fi
fi

if [ "$ALREADY_EXISTS" = true ]; then
  log_msg "INFO" "OAuth session with STATE [${STATE}] already exists in CSV."
else
  ROW="\"${SESSION_ID}\",\"google\",\"gemini-3.8-flash\",\"1. Google OAuth\",\"${OAUTH_URL}\",\"${CLIENT_ID}\",\"${STATE}\",\"${CODE_CHALLENGE}\",\"${REDIRECT_URI}\",\"\",\"PENDING\",\"${NOW}\",\"${NOW}\""
  echo "$ROW" >> "$CSV_FILE"
  log_msg "INFO" "Persisted new OAuth session [${SESSION_ID}] to CSV at ${CSV_FILE}"
fi

# Persist pending OAuth response payload to bidirectional volume
SESSION_META_FILE="${RESP_DIR}/oauth_session_${SESSION_ID}.json"
echo "{\"sessionId\":\"${SESSION_ID}\",\"provider\":\"google\",\"authMode\":\"1. Google OAuth\",\"oauthUrl\":\"${OAUTH_URL}\",\"clientId\":\"${CLIENT_ID}\",\"state\":\"${STATE}\",\"codeChallenge\":\"${CODE_CHALLENGE}\",\"redirectUri\":\"${REDIRECT_URI}\",\"status\":\"PENDING\",\"createdAt\":\"${NOW}\"}" > "$SESSION_META_FILE"

# Wait for Auth Code or timeout (default: 300s)
TIMEOUT="${AUTH_TIMEOUT_SECONDS:-300}"
log_msg "INFO" "Daemon waiting for authorization code input (timeout: ${TIMEOUT}s)..."

for ((s=0; s<TIMEOUT; s+=2)); do
  if ! kill -0 "$CLI_PID" 2>/dev/null; then
    log_msg "INFO" "CLI process ${CLI_PID} finished. Terminating daemon loop."
    break
  fi

  if [ -f "$CODE_FILE" ]; then
    AUTH_CODE=$(cat "$CODE_FILE" 2>/dev/null | tr -d '\r\n[:space:]')
    if [ -n "$AUTH_CODE" ]; then
      log_msg "INFO" "Authorization code received! Delivering to Antigravity CLI stdin..."
      printf "%s\r\n" "$AUTH_CODE" > "$FIFO_IN"

      # Update CSV to COMPLETED
      COMPLETED_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
      TEMP_CSV="${CSV_FILE}.tmp"
      awk -F',' -v sid="\"${SESSION_ID}\"" -v code="\"${AUTH_CODE}\"" -v ts="\"${COMPLETED_TS}\"" '
        BEGIN { OFS="," }
        $1 == sid { $10 = code; $11 = "\"COMPLETED\""; $13 = ts }
        { print }
      ' "$CSV_FILE" > "$TEMP_CSV" && mv "$TEMP_CSV" "$CSV_FILE"

      # Update response JSON in bidirectional volume
      echo "{\"sessionId\":\"${SESSION_ID}\",\"provider\":\"google\",\"authMode\":\"1. Google OAuth\",\"oauthUrl\":\"${OAUTH_URL}\",\"clientId\":\"${CLIENT_ID}\",\"state\":\"${STATE}\",\"authCode\":\"${AUTH_CODE}\",\"status\":\"COMPLETED\",\"completedAt\":\"${COMPLETED_TS}\"}" > "$SESSION_META_FILE"

      log_msg "INFO" "Marked session [${SESSION_ID}] as COMPLETED in CSV and response store."

      # Wait for token exchange and persist credentials
      sleep 4
      if [ -d "$HOME/.config/antigravity" ]; then
        cp -rf "$HOME/.config/antigravity"/* "$CRED_DIR/" 2>/dev/null || true
        log_msg "INFO" "Copied Antigravity credentials to bidirectional volume at ${CRED_DIR}"
      fi
      break
    fi
  fi
  sleep 2
done

log_msg "INFO" "Antigravity OAuth daemon session closed."
