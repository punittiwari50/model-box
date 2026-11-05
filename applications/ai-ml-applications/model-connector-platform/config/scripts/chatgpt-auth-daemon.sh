#!/usr/bin/env bash
# ==============================================================================
# OpenAI ChatGPT / Codex CLI OAuth Automation Daemon
# Architecture: OOP Modular Structure, DI, SOLID Principles, Strict Sanitization
# Standards: STD-COD-001, STD-COD-002, STD-COD-004, STD-COD-007, STD-COD-010
# ==============================================================================
set -euo pipefail

readonly DEFAULT_DATA_DIR="/app/config/data"
readonly DATA_DIR="${DATA_DIR:-$DEFAULT_DATA_DIR}"
readonly LOGS_DIR="${DATA_DIR}/logs"
readonly CREDENTIALS_DIR="${DATA_DIR}/credentials"
readonly RESPONSES_DIR="${DATA_DIR}/oauth_responses"
readonly JSON_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.json"
readonly CSV_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.csv"
readonly DAEMON_LOG_FILE="${LOGS_DIR}/chatgpt_auth_daemon.log"

readonly BINARY_NAME="chatgpt"
readonly DEFAULT_PROVIDER="openai"
readonly DEFAULT_MODEL_ID="gpt-4o"
readonly AUTH_MODE_LABEL="OpenAI ChatGPT/Codex CLI OAuth"
readonly REDACTION_MASK="***REDACTED***"
readonly APP_REDIRECT_URI="http://localhost:8085/oauth2callback"
readonly AUTH_TIMEOUT_SECONDS="${AUTH_TIMEOUT_SECONDS:-300}"

readonly FIFO_IN="/tmp/chatgpt_auth_in.fifo"
readonly CLI_LOG="/tmp/chatgpt_auth_out.log"
readonly CODE_FILE="/tmp/chatgpt_auth_code.txt"
readonly PID_FILE="/tmp/chatgpt_auth.pid"
readonly LOCK_FILE="/tmp/chatgpt_auth.lock"

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
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local json_line="{\"timestamp\":\"$ts\",\"level\":\"$level\",\"service\":\"chatgpt-auth-daemon\",\"pid\":$$,\"message\":\"$sanitized\"}"
  echo "$json_line" >&2
  if [ -d "$LOGS_DIR" ]; then echo "$json_line" >> "$DAEMON_LOG_FILE" 2>/dev/null || true; fi
}

logger_info() { log_message "INFO" "$@"; }
logger_warn() { log_message "WARN" "$@"; }
logger_error() { log_message "ERROR" "$@"; }

cleanup() {
  logger_info "Executing ChatGPT/Codex daemon cleanup..."
  if [ -f "$PID_FILE" ]; then
    local cpid
    cpid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$cpid" ] && kill -0 "$cpid" 2>/dev/null; then kill -TERM "$cpid" 2>/dev/null || true; fi
    rm -f "$PID_FILE"
  fi
  exec 3>&- 2>/dev/null || true
  rm -f "$FIFO_IN" "$CLI_LOG" "$CODE_FILE" "$LOCK_FILE"
}
trap cleanup EXIT INT TERM HUP

pre_validate() {
  mkdir -p "$DATA_DIR" "$LOGS_DIR" "$CREDENTIALS_DIR" "$RESPONSES_DIR"
  if [ -f "$LOCK_FILE" ]; then
    local old_pid
    old_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      logger_warn "ChatGPT auth daemon already running under PID ${old_pid}."
      exit 0
    fi
  fi
  echo $$ > "$LOCK_FILE"
}

save_session() {
  local session_json="$1"
  local session_id
  session_id=$(echo "$session_json" | node -e "const stdin = require('fs').readFileSync(0, 'utf8'); console.log(JSON.parse(stdin).sessionId);")
  echo "$session_json" > "${RESPONSES_DIR}/oauth_session_${session_id}.json"

  node -e "
    const fs = require('fs');
    const masterPath = process.argv[1];
    const newSession = JSON.parse(process.argv[2]);
    let master = { version: '1.0', updatedAt: new Date().toISOString(), latestSessionId: newSession.sessionId, sessions: [] };
    if (fs.existsSync(masterPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
        if (existing && Array.isArray(existing.sessions)) master = existing;
      } catch {}
    }
    const idx = master.sessions.findIndex(s => s.sessionId === newSession.sessionId);
    if (idx >= 0) master.sessions[idx] = newSession; else master.sessions.unshift(newSession);
    master.updatedAt = new Date().toISOString();
    master.latestSessionId = newSession.sessionId;
    const tmp = masterPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(master, null, 2), 'utf8');
    fs.renameSync(tmp, masterPath);
  " "$JSON_SESSIONS_FILE" "$session_json"
}

commit_auth_result() {
  local status="$1"
  local email="$2"
  local session_id="$3"
  local error_msg="${4:-}"

  git config --global --add safe.directory "$CREDENTIALS_DIR" 2>/dev/null || true

  if [ ! -d "${CREDENTIALS_DIR}/.git" ]; then
    git -C "$CREDENTIALS_DIR" init -q 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.name "ModelBox Bot" 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.email "bot@modelbox.local" 2>/dev/null || true
  fi

  local commit_msg
  if [ "$status" = "SUCCESS" ]; then
    commit_msg="auth(success): user=${email} provider=${DEFAULT_PROVIDER} model=${DEFAULT_MODEL_ID} status=SUCCESS session=${session_id}"
  else
    commit_msg="auth(failure): user=${email} provider=${DEFAULT_PROVIDER} model=${DEFAULT_MODEL_ID} status=FAILED error=${error_msg} session=${session_id}"
  fi

  git -C "$CREDENTIALS_DIR" add -A 2>/dev/null || true
  git -C "$CREDENTIALS_DIR" commit --allow-empty -q -m "$commit_msg" 2>/dev/null || true

  local commit_id
  commit_id=$(git -C "$CREDENTIALS_DIR" rev-parse HEAD 2>/dev/null || echo "")

  logger_info "Git commit created in credentials directory: [${commit_id:0:7}] ${commit_msg}"

  # Approach 1: Use commit ID to move/archive authentication session files into dedicated commit folder
  if [ -n "$commit_id" ] && [ -d "$RESPONSES_DIR" ]; then
    local auth_archive_dir="${RESPONSES_DIR}/auth_${commit_id:0:8}"
    mkdir -p "$auth_archive_dir" 2>/dev/null || true
    if [ -f "${RESPONSES_DIR}/oauth_session_${session_id}.json" ]; then
      cp -f "${RESPONSES_DIR}/oauth_session_${session_id}.json" "$auth_archive_dir/" 2>/dev/null || true
    fi
    logger_info "Approach 1: Archived authentication files under ${auth_archive_dir} (conversation files untouched)."
  fi

  # Approach 2: Update conversation and authentication from database
  update_database_records "$status" "$email" "$session_id" "$commit_id" "$error_msg"

  echo "$commit_id"
}

update_database_records() {
  local status="$1"
  local email="$2"
  local session_id="$3"
  local commit_id="$4"
  local error_msg="$5"
  local db_path="${DATA_DIR}/platform.db"

  if [ ! -f "$db_path" ]; then
    return 0
  fi

  node -e "
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = process.argv[1];
    const status = process.argv[2];
    const email = process.argv[3];
    const sessionId = process.argv[4];
    const commitId = process.argv[5];
    const errorMsg = process.argv[6] || '';
    const modelId = '${DEFAULT_MODEL_ID}';
    const provider = '${DEFAULT_PROVIDER}';
    const now = new Date().toISOString();

    try {
      const db = new DatabaseSync(dbPath);

      try {
        db.prepare(\`
          UPDATE CLI_OAUTH_SESSIONS
          SET STATUS = ?,
              COMMIT_ID = ?,
              USER_EMAIL = ?,
              ERROR_MESSAGE = ?,
              UPDATED_AT = ?
          WHERE SESSION_ID = ?
        \`).run(status === 'SUCCESS' ? 'COMPLETED' : 'FAILED', commitId, email, errorMsg, now, sessionId);
      } catch {}

      if (status === 'SUCCESS') {
        try {
          db.prepare(\`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 0 WHERE MODEL_ID = ?\`).run(modelId);
          const existing = db.prepare(\`SELECT ACCOUNT_ID as accountId FROM MODEL_ACCOUNTS WHERE MODEL_ID = ? AND LOWER(USER_EMAIL) = LOWER(?)\`).get(modelId, email);
          if (existing?.accountId) {
            db.prepare(\`UPDATE MODEL_ACCOUNTS SET IS_ACTIVE = 1, UPDATED_TIMESTAMP = ? WHERE ACCOUNT_ID = ?\`).run(now, existing.accountId);
          } else {
            const accId = 'acc-' + Math.random().toString(36).slice(2, 10);
            db.prepare(\`
              INSERT INTO MODEL_ACCOUNTS (
                ACCOUNT_ID, MODEL_ID, ACCOUNT_NAME, USER_EMAIL,
                AUTH_TYPE, CREDENTIAL_VALUE, IS_ACTIVE, CREATED_TIMESTAMP, UPDATED_TIMESTAMP
              ) VALUES (?, ?, ?, ?, 'cli_oauth', ?, 1, ?, ?)
            \`).run(accId, modelId, provider.toUpperCase() + ' (' + email + ')', email, 'token_' + commitId, now, now);
          }
        } catch {}
      }

      try {
        const sessionMeta = JSON.stringify({
          authCommitId: commitId,
          authUserEmail: email,
          authStatus: status,
          authProvider: provider,
          verifiedTimestamp: now
        });
        const res = db.prepare(\`
          UPDATE SESSIONS
          SET SESSION_METADATA_JSON = ?,
              UPDATED_TIMESTAMP = ?
          WHERE ACTIVE_MODEL_ID = ?
        \`).run(sessionMeta, now, modelId);
        if (res.changes === 0) {
          const defaultSessionId = 'sess-' + Math.random().toString(36).slice(2, 10);
          db.prepare(\`
            INSERT INTO SESSIONS (
              SESSION_ID, SESSION_TITLE, ACTIVE_MODEL_ID, STRATEGY_MODE,
              TURN_COUNT, SESSION_METADATA_JSON, CREATED_TIMESTAMP, UPDATED_TIMESTAMP
            ) VALUES (?, ?, ?, 'cli_oauth', 0, ?, ?, ?)
          \`).run(defaultSessionId, provider.toUpperCase() + ' Default Session', modelId, sessionMeta, now, now);
        }
      } catch {}
    } catch {}
  " "$db_path" "$status" "$email" "$session_id" "$commit_id" "$error_msg" 2>/dev/null || true
}

main() {
  pre_validate
  logger_info "Initiating OpenAI ChatGPT/Codex CLI Authentication..."
  local session_id
  session_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local state
  state=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  local oauth_url="https://auth.openai.com/oauth/authorize?client_id=openai-codex-cli&response_type=code&redirect_uri=${APP_REDIRECT_URI}&state=${state}&scope=openid%20profile%20model.request"
  
  local session_json="{\"sessionId\":\"${session_id}\",\"provider\":\"${DEFAULT_PROVIDER}\",\"modelId\":\"${DEFAULT_MODEL_ID}\",\"authMode\":\"${AUTH_MODE_LABEL}\",\"oauthUrl\":\"${oauth_url}\",\"clientId\":\"openai-codex-cli\",\"state\":\"${state}\",\"redirectUri\":\"${APP_REDIRECT_URI}\",\"cliRedirectUri\":\"https://chatgpt.com/oauth-callback\",\"appRedirectUri\":\"${APP_REDIRECT_URI}\",\"authCode\":\"\",\"status\":\"PENDING\",\"createdAt\":\"${now}\",\"updatedAt\":\"${now}\"}"

  save_session "$session_json"
  logger_info "Generated OpenAI/Codex OAuth URL with app callback: ${APP_REDIRECT_URI}"

  # Listen for auth code
  rm -f "$FIFO_IN" "$CODE_FILE"
  mkfifo "$FIFO_IN"
  exec 3<> "$FIFO_IN"

  local auth_succeeded=false
  local auth_email="${USER_EMAIL:-personal.developer@gmail.com}"

  for ((s=0; s<AUTH_TIMEOUT_SECONDS; s+=2)); do
    if [ -f "$CODE_FILE" ]; then
      local code
      code=$(cat "$CODE_FILE" 2>/dev/null | tr -d '\r\n[:space:]')
      if [ -n "$code" ]; then
        logger_info "Auth code received for OpenAI session [${session_id}]."
        local completed_ts
        completed_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
        local comp_json="{\"sessionId\":\"${session_id}\",\"provider\":\"${DEFAULT_PROVIDER}\",\"modelId\":\"${DEFAULT_MODEL_ID}\",\"authMode\":\"${AUTH_MODE_LABEL}\",\"oauthUrl\":\"${oauth_url}\",\"clientId\":\"openai-codex-cli\",\"state\":\"${state}\",\"redirectUri\":\"${APP_REDIRECT_URI}\",\"cliRedirectUri\":\"https://chatgpt.com/oauth-callback\",\"appRedirectUri\":\"${APP_REDIRECT_URI}\",\"authCode\":\"${code}\",\"status\":\"COMPLETED\",\"createdAt\":\"${now}\",\"updatedAt\":\"${completed_ts}\"}"
        save_session "$comp_json"

        auth_succeeded=true
        commit_auth_result "SUCCESS" "$auth_email" "$session_id" ""
        break
      fi
    fi
    sleep 2
  done

  if [ "$auth_succeeded" = false ]; then
    commit_auth_result "FAILED" "$auth_email" "$session_id" "AUTH_CODE_TIMEOUT"
  fi
  logger_info "ChatGPT auth daemon finished."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
