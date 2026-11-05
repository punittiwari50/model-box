#!/usr/bin/env bash
# ==============================================================================
# Antigravity CLI Google OAuth Automation Daemon
# Architecture: OOP Modular Structure, DI, SOLID Principles, Strict Sanitization
# Standards: STD-COD-001, STD-COD-002, STD-COD-004, STD-COD-007, STD-COD-010
# ==============================================================================
set -euo pipefail

# ==============================================================================
# Module: ConfigService (Centralized Static Constants)
# ==============================================================================
readonly DEFAULT_DATA_DIR="/app/config/data"
readonly DATA_DIR="${DATA_DIR:-$DEFAULT_DATA_DIR}"
readonly DOWNLOADS_DIR="${DATA_DIR}/downloads"
readonly LOGS_DIR="${DATA_DIR}/logs"
readonly CREDENTIALS_DIR="${DATA_DIR}/credentials"
readonly RESPONSES_DIR="${DATA_DIR}/oauth_responses"

readonly JSON_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.json"
readonly CSV_SESSIONS_FILE="${DATA_DIR}/oauth_sessions.csv"
readonly DAEMON_LOG_FILE="${LOGS_DIR}/antigravity_auth_daemon.log"

readonly DOWNLOAD_URL="https://github.com/google-antigravity/antigravity-cli/releases/download/1.4.12/agy_cli_linux_x64.tar.gz"
readonly ARCHIVE_FILENAME="agy_cli_linux_x64.tar.gz"
readonly ARCHIVE_LOCAL_PATH="${DOWNLOADS_DIR}/${ARCHIVE_FILENAME}"
readonly BINARY_NAME="antigravity"
readonly SYSTEM_BIN_DIR="${CLI_BIN_DIR:-/opt/model-connector/bin}"
readonly TARGET_BINARY_PATH="${SYSTEM_BIN_DIR}/${BINARY_NAME}"
readonly TARGET_SYMLINK_PATH="${SYSTEM_BIN_DIR}/agy"

readonly FIFO_IN="/tmp/antigravity_auth_in.fifo"
readonly CLI_LOG="/tmp/antigravity_auth_out.log"
readonly CODE_FILE="/tmp/antigravity_auth_code.txt"
readonly PID_FILE="/tmp/antigravity_auth.pid"
readonly DAEMON_PID_FILE="/tmp/antigravity_auth_daemon.pid"
readonly LOCK_FILE="/tmp/antigravity_auth.lock"

readonly DEFAULT_PROVIDER="google"
readonly DEFAULT_MODEL_ID="gemini-3.8-flash"
readonly AUTH_MODE_LABEL="1. Google OAuth"
readonly REDACTION_MASK="***REDACTED***"
readonly AUTH_TIMEOUT_SECONDS="${AUTH_TIMEOUT_SECONDS:-300}"
readonly MENU_WAIT_TIMEOUT=20
readonly URL_DISCOVERY_TIMEOUT=40

RESOLVED_CLI_BIN=""

# ==============================================================================
# Module: LoggerService (Dual Stream + Sensitive Leak Prevention)
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
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local json_line="{\"timestamp\":\"$ts\",\"level\":\"$level\",\"service\":\"antigravity-auth-daemon\",\"pid\":$$,\"message\":\"$sanitized\"}"
  # Output to stderr (captured by Docker logs directly)
  echo "$json_line" >&2
  # Output to persistent log file (in bidirectional volume)
  if [ -d "$LOGS_DIR" ]; then
    echo "$json_line" >> "$DAEMON_LOG_FILE" 2>/dev/null || true
  fi
}

logger_info() { log_message "INFO" "$@"; }
logger_warn() { log_message "WARN" "$@"; }
logger_error() { log_message "ERROR" "$@"; }

# ==============================================================================
# Module: CleanupService (Resource Disposal & Process Management)
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
# Module: PreValidationService (Fail-Fast Verification Before Execution)
# ==============================================================================
pre_validate_environment() {
  logger_info "Running pre-flight environment validations..."

  # 1. Validate required system utilities
  local required_tools=("node" "tar" "curl" "script" "mkfifo")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      logger_error "Pre-validation failed: Required utility '${tool}' is not available."
      return 1
    fi
  done

  # 2. Validate / create directory structure in bidirectional volume
  local required_dirs=("$DATA_DIR" "$DOWNLOADS_DIR" "$LOGS_DIR" "$CREDENTIALS_DIR" "$RESPONSES_DIR" "$SYSTEM_BIN_DIR")
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

  # 3. Check single daemon instance concurrency
  if [ -f "$LOCK_FILE" ]; then
    local old_pid
    old_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      logger_warn "Daemon already active under PID ${old_pid}. Terminating duplicate invocation."
      exit 0
    fi
  fi
  echo $$ > "$LOCK_FILE"
  echo $$ > "$DAEMON_PID_FILE"

  logger_info "Pre-flight validations succeeded."
  return 0
}

# ==============================================================================
# Module: BinaryDownloadService (Bidirectional Volume Download & Extraction)
# ==============================================================================
resolve_binary() {
  # 1. Check existing executable paths
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

  # 2. Check or download tarball into bidirectional volume
  if [ ! -f "$ARCHIVE_LOCAL_PATH" ]; then
    logger_info "Downloading Antigravity CLI archive into bidirectional volume: ${ARCHIVE_LOCAL_PATH}..."
    if ! curl -fsSL "$DOWNLOAD_URL" -o "$ARCHIVE_LOCAL_PATH"; then
      logger_error "Failed to download Antigravity CLI from ${DOWNLOAD_URL}"
      return 1
    fi
    chmod 666 "$ARCHIVE_LOCAL_PATH" 2>/dev/null || true
    logger_info "Download complete and preserved in bidirectional volume at: ${ARCHIVE_LOCAL_PATH}"
  else
    logger_info "Discovered existing CLI archive in bidirectional volume: ${ARCHIVE_LOCAL_PATH}"
  fi

  # 3. Extract binary to SYSTEM_BIN_DIR
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
# Module: JsonValidatorService (Strict Schema & Syntax Validation)
# ==============================================================================
validate_session_json() {
  local json_payload="$1"
  node -e "
    try {
      const data = JSON.parse(process.argv[1]);
      if (!data || typeof data !== 'object') process.exit(1);
      const req = ['sessionId', 'provider', 'modelId', 'authMode', 'oauthUrl', 'status', 'createdAt', 'updatedAt'];
      for (const field of req) {
        if (!data[field] || typeof data[field] !== 'string') process.exit(2);
      }
      process.exit(0);
    } catch {
      process.exit(3);
    }
  " "$json_payload" >/dev/null 2>&1
}

validate_sessions_file() {
  local file_path="$1"
  if [ ! -f "$file_path" ]; then return 1; fi
  node -e "
    try {
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      if (!data || !Array.isArray(data.sessions)) process.exit(1);
      process.exit(0);
    } catch {
      process.exit(2);
    }
  " "$file_path" >/dev/null 2>&1
}

# ==============================================================================
# Module: SessionPersistenceService (Atomic JSON & CSV Persistence)
# ==============================================================================
save_session_record() {
  local session_json="$1"

  # 1. Validate session JSON schema before writing
  if ! validate_session_json "$session_json"; then
    logger_error "JSON validation failed for session payload. Rejecting write."
    return 1
  fi

  local session_id
  session_id=$(echo "$session_json" | node -e "const stdin = require('fs').readFileSync(0, 'utf8'); console.log(JSON.parse(stdin).sessionId);")

  # 2. Persist single-session JSON file into bidirectional responses directory
  local single_session_file="${RESPONSES_DIR}/oauth_session_${session_id}.json"
  echo "$session_json" > "$single_session_file"

  # 3. Atomically upsert into master oauth_sessions.json in bidirectional volume
  node -e "
    const fs = require('fs');
    const masterPath = process.argv[1];
    const newSession = JSON.parse(process.argv[2]);
    let master = { version: '1.0', updatedAt: new Date().toISOString(), latestSessionId: newSession.sessionId, sessions: [] };
    if (fs.existsSync(masterPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
        if (existing && Array.isArray(existing.sessions)) {
          master = existing;
        }
      } catch {}
    }
    const idx = master.sessions.findIndex(s => s.sessionId === newSession.sessionId);
    if (idx >= 0) {
      master.sessions[idx] = newSession;
    } else {
      master.sessions.unshift(newSession);
    }
    master.updatedAt = new Date().toISOString();
    master.latestSessionId = newSession.sessionId;
    const tmp = masterPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(master, null, 2), 'utf8');
    fs.renameSync(tmp, masterPath);
  " "$JSON_SESSIONS_FILE" "$session_json"

  # Validate master JSON after atomic write
  if ! validate_sessions_file "$JSON_SESSIONS_FILE"; then
    logger_error "Master sessions JSON file validation failed after write!"
    return 1
  fi

  # 4. Also update CSV for backward compatibility
  update_csv_store "$session_json"

  logger_info "Validated and persisted OAuth session [${session_id}] to JSON."
  return 0
}

update_csv_store() {
  local session_json="$1"
  if [ ! -f "$CSV_SESSIONS_FILE" ]; then
    echo "SESSION_ID,PROVIDER,MODEL_ID,AUTH_MODE,OAUTH_URL,CLIENT_ID,STATE,CODE_CHALLENGE,REDIRECT_URI,AUTH_CODE,STATUS,CREATED_AT,UPDATED_AT" > "$CSV_SESSIONS_FILE"
    chmod 666 "$CSV_SESSIONS_FILE" 2>/dev/null || true
  fi

  node -e "
    const fs = require('fs');
    const csvPath = process.argv[1];
    const s = JSON.parse(process.argv[2]);
    const row = [
      s.sessionId, s.provider, s.modelId, s.authMode, s.oauthUrl,
      s.clientId || '', s.state || '', s.codeChallenge || '', s.redirectUri || '',
      s.authCode || '', s.status, s.createdAt, s.updatedAt
    ].map(v => '\"' + String(v).replace(/\"/g, '\"\"') + '\"').join(',');
    
    let content = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8') : '';
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    const header = lines[0] || 'SESSION_ID,PROVIDER,MODEL_ID,AUTH_MODE,OAUTH_URL,CLIENT_ID,STATE,CODE_CHALLENGE,REDIRECT_URI,AUTH_CODE,STATUS,CREATED_AT,UPDATED_AT';
    const dataLines = lines.slice(1);
    const sidQuoted = '\"' + s.sessionId + '\"';
    const existingIdx = dataLines.findIndex(l => l.startsWith(sidQuoted));
    if (existingIdx >= 0) {
      dataLines[existingIdx] = row;
    } else {
      dataLines.unshift(row);
    }
    fs.writeFileSync(csvPath, [header, ...dataLines].join('\n') + '\n', 'utf8');
  " "$CSV_SESSIONS_FILE" "$session_json"
}

# ==============================================================================
# Module: LocalVcsCommitService & DatabaseRecordSync (Purely Shell Script)
# ==============================================================================
commit_auth_result() {
  local status="$1"        # "SUCCESS" or "FAILED"
  local email="$2"         # User email used for authentication
  local session_id="$3"    # Session ID
  local error_msg="${4:-}" # Error reason if failed

  git config --global --add safe.directory "$CREDENTIALS_DIR" 2>/dev/null || true

  # Ensure git is initialized in CREDENTIALS_DIR for purely in-container tracking
  if [ ! -d "${CREDENTIALS_DIR}/.git" ]; then
    git -C "$CREDENTIALS_DIR" init -q 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.name "ModelBox Bot" 2>/dev/null || true
    git -C "$CREDENTIALS_DIR" config user.email "bot@modelbox.local" 2>/dev/null || true
  fi

  # Construct required commit message stating success/failure status and email
  local commit_msg
  if [ "$status" = "SUCCESS" ]; then
    commit_msg="auth(success): user=${email} provider=${DEFAULT_PROVIDER} model=${DEFAULT_MODEL_ID} status=SUCCESS session=${session_id}"
  else
    commit_msg="auth(failure): user=${email} provider=${DEFAULT_PROVIDER} model=${DEFAULT_MODEL_ID} status=FAILED error=${error_msg} session=${session_id}"
  fi

  # Stage ONLY authentication folder files (strictly inside CREDENTIALS_DIR, NEVER conversation folder/files)
  git -C "$CREDENTIALS_DIR" add -A 2>/dev/null || true
  git -C "$CREDENTIALS_DIR" commit --allow-empty -q -m "$commit_msg" 2>/dev/null || true

  local commit_id
  commit_id=$(git -C "$CREDENTIALS_DIR" rev-parse HEAD 2>/dev/null || echo "")

  logger_info "Git commit created in credentials directory: [${commit_id:0:7}] ${commit_msg}"

  # Approach 1: Use commit ID to move/archive authentication session files into dedicated commit folder
  # (Strictly authentication files, conversation files remain untouched)
  if [ -n "$commit_id" ] && [ -d "$RESPONSES_DIR" ]; then
    local auth_archive_dir="${RESPONSES_DIR}/auth_${commit_id:0:8}"
    mkdir -p "$auth_archive_dir" 2>/dev/null || true
    if [ -f "${RESPONSES_DIR}/session_${session_id}.json" ]; then
      cp -f "${RESPONSES_DIR}/session_${session_id}.json" "$auth_archive_dir/" 2>/dev/null || true
    fi
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
    logger_warn "Database not found at ${db_path}, skipping database record update."
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

      // 1. Update authentication record in CLI_OAUTH_SESSIONS
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
      } catch (err) {
        console.error('CLI_OAUTH_SESSIONS update:', err.message);
      }

      // 2. Update MODEL_ACCOUNTS if authentication succeeded
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
        } catch (err) {
          console.error('MODEL_ACCOUNTS update:', err.message);
        }
      }

      // 3. Update conversation session in SESSIONS table with authentication metadata
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
      } catch (err) {
        console.error('SESSIONS conversation update:', err.message);
      }

      console.log('Approach 2: Database successfully updated for session ' + sessionId);
    } catch (err) {
      console.error('Database connection error:', err.message);
    }
  " "$db_path" "$status" "$email" "$session_id" "$commit_id" "$error_msg" 2>/dev/null || true

  logger_info "Approach 2: Pure database synchronization executed for authentication and conversation."
}

# ==============================================================================
# Module: PtyProcessManager & DaemonEngine (Orchestration Loop)
# ==============================================================================
run_oauth_daemon() {
  local cli_bin="$1"

  # Prepare named FIFO
  rm -f "$FIFO_IN" "$CLI_LOG" "$CODE_FILE"
  mkfifo "$FIFO_IN"
  exec 3<> "$FIFO_IN"

  logger_info "Spawning Antigravity CLI process in pseudo-terminal mode..."
  COLUMNS=2000 LINES=100 script -q -c "${cli_bin}" /dev/null < "$FIFO_IN" > "$CLI_LOG" 2>&1 &
  local cli_pid=$!
  echo "$cli_pid" > "$PID_FILE"
  logger_info "Antigravity CLI process launched with PID: ${cli_pid}"

  # Wait for 'Select login method:' prompt and send Enter to select 'Option 1: Google OAuth'
  local selected_option=false
  for ((i=1; i<=MENU_WAIT_TIMEOUT; i++)); do
    if [ -f "$CLI_LOG" ] && grep -qi "Select login method" "$CLI_LOG"; then
      logger_info "Detected interactive login menu. Transmitting newline to select '${AUTH_MODE_LABEL}'..."
      printf '\r\n' >&3
      selected_option=true
      break
    fi
    sleep 0.2
  done

  if [ "$selected_option" = false ]; then
    logger_info "Default menu timer elapsed. Transmitting newline to confirm Option 1..."
    printf '\r\n' >&3
  fi

  # Wait and extract Google OAuth URL from output
  local oauth_url=""
  for ((i=1; i<=URL_DISCOVERY_TIMEOUT; i++)); do
    if [ -f "$CLI_LOG" ]; then
      oauth_url=$(node -e "
        const fs = require('fs');
        try {
          const text = fs.readFileSync('${CLI_LOG}', 'utf8');
          const m = text.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s\r\n]+/);
          if (m) console.log(m[0].trim());
        } catch {}
      " 2>/dev/null || true)
      if [ -n "$oauth_url" ]; then break; fi
    fi
    sleep 0.5
  done

  if [ -z "$oauth_url" ]; then
    logger_warn "No Google OAuth authorization URL captured within timeout."
    commit_auth_result "FAILED" "${USER_EMAIL:-personal.developer@gmail.com}" "session-init" "URL_DISCOVERY_TIMEOUT"
    return 0
  fi

  logger_info "Captured Google OAuth Authorization URL."

  # Extract parameters via Node.js
  local session_id
  session_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

  local session_json
  session_json=$(node -e "
    try {
      const u = new URL(process.argv[1]);
      const session = {
        sessionId: process.argv[2],
        provider: '${DEFAULT_PROVIDER}',
        modelId: '${DEFAULT_MODEL_ID}',
        authMode: '${AUTH_MODE_LABEL}',
        oauthUrl: u.href,
        clientId: u.searchParams.get('client_id') || '',
        state: u.searchParams.get('state') || '',
        codeChallenge: u.searchParams.get('code_challenge') || '',
        redirectUri: u.searchParams.get('redirect_uri') || '',
        cliRedirectUri: u.searchParams.get('redirect_uri') || 'https://antigravity.google/oauth-callback',
        appRedirectUri: 'http://localhost:8085/oauth2callback',
        authCode: '',
        status: 'PENDING',
        createdAt: process.argv[3],
        updatedAt: process.argv[3]
      };
      console.log(JSON.stringify(session));
    } catch {
      console.log('{}');
    }
  " "$oauth_url" "$session_id" "$now")

  save_session_record "$session_json"

  local auth_succeeded=false
  local auth_email="${USER_EMAIL:-personal.developer@gmail.com}"

  # Wait for Auth Code delivery or timeout
  logger_info "Waiting for user authorization code input (timeout: ${AUTH_TIMEOUT_SECONDS}s)..."
  for ((s=0; s<AUTH_TIMEOUT_SECONDS; s+=2)); do
    if ! kill -0 "$cli_pid" 2>/dev/null; then
      logger_info "CLI process ${cli_pid} finished. Terminating daemon waiting loop."
      break
    fi

    if [ -f "$CODE_FILE" ]; then
      local auth_code
      auth_code=$(cat "$CODE_FILE" 2>/dev/null | tr -d '\r\n[:space:]')
      if [ -n "$auth_code" ]; then
        logger_info "Authorization code received! Transmitting to Antigravity CLI stdin..."
        printf "%s\r\n" "$auth_code" >&3

        local completed_ts
        completed_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

        # Update session JSON record to COMPLETED
        local completed_json
        completed_json=$(node -e "
          const s = JSON.parse(process.argv[1]);
          s.authCode = process.argv[2];
          s.status = 'COMPLETED';
          s.updatedAt = process.argv[3];
          console.log(JSON.stringify(s));
        " "$session_json" "$auth_code" "$completed_ts")

        save_session_record "$completed_json"

        # Wait for token exchange and copy credentials to bidirectional directory
        sleep 4
        if [ -d "$HOME/.config/antigravity" ]; then
          cp -rf "$HOME/.config/antigravity"/* "$CREDENTIALS_DIR/" 2>/dev/null || true
          logger_info "Copied Antigravity credentials to bidirectional volume at ${CREDENTIALS_DIR}"
        fi
        if [ -d "$HOME/.gemini" ]; then
          cp -rf "$HOME/.gemini"/* "$CREDENTIALS_DIR/" 2>/dev/null || true
          logger_info "Copied Gemini credentials to bidirectional volume at ${CREDENTIALS_DIR}"
        fi

        # Attempt to dynamically extract user email from captured credentials
        local cred_email
        cred_email=$(node -e "
          const fs = require('fs');
          const paths = ['${CREDENTIALS_DIR}/credentials.json', '${CREDENTIALS_DIR}/tokens.json', '${CREDENTIALS_DIR}/oauth.json'];
          for (const p of paths) {
            try {
              if (fs.existsSync(p)) {
                const c = JSON.parse(fs.readFileSync(p, 'utf8'));
                const em = c.email || c.user_email || c.user || (c.profile && c.profile.email);
                if (em) { console.log(em); process.exit(0); }
              }
            } catch {}
          }
        " 2>/dev/null || true)
        if [ -n "$cred_email" ]; then
          auth_email="$cred_email"
        fi

        auth_succeeded=true
        commit_auth_result "SUCCESS" "$auth_email" "$session_id" ""
        break
      fi
    fi
    sleep 2
  done

  if [ "$auth_succeeded" = false ]; then
    logger_warn "Authorization code was not provided within timeout (${AUTH_TIMEOUT_SECONDS}s)."
    commit_auth_result "FAILED" "$auth_email" "$session_id" "AUTH_CODE_TIMEOUT"
  fi

  logger_info "Antigravity OAuth daemon session closed."
}

# ==============================================================================
# Main Entrypoint
# ==============================================================================
main() {
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
