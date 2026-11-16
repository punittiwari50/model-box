#!/usr/bin/env bash
# ==============================================================================
# Model CLI Authentication Unified Dispatcher / Launcher
# Dispatches model CLI daemon based on modelId or provider (Strategy Pattern)
# Supports invocation modes:
#   Mode 1: Startup daemon: model-cli-auth-launcher.sh --startup --email <email>
#   Mode 2: On-Demand model config: model-cli-auth-launcher.sh <modelId> [provider] --email <email>
# ==============================================================================
set -euo pipefail

IS_STARTUP=false
USER_EMAIL=""
CLIENT_ID="default"
CORRELATION_ID="${CORRELATION_ID:-}"
TRACE_ID="${TRACE_ID:-}"
SPAN_ID="${SPAN_ID:-}"
PARENT_SPAN_ID="${PARENT_SPAN_ID:-}"
POSITIONAL=()

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
    --correlation-id)
      CORRELATION_ID="${2:-}"
      shift 2
      ;;
    --correlation-id=*)
      CORRELATION_ID="${1#*=}"
      shift
      ;;
    --trace-id)
      TRACE_ID="${2:-}"
      shift 2
      ;;
    --trace-id=*)
      TRACE_ID="${1#*=}"
      shift
      ;;
    --span-id)
      SPAN_ID="${2:-}"
      shift 2
      ;;
    --span-id=*)
      SPAN_ID="${1#*=}"
      shift
      ;;
    --parent-span-id)
      PARENT_SPAN_ID="${2:-}"
      shift 2
      ;;
    --parent-span-id=*)
      PARENT_SPAN_ID="${1#*=}"
      shift
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [ ${#POSITIONAL[@]} -gt 0 ]; then
  set -- "${POSITIONAL[@]}"
else
  set --
fi

MODEL_ID="${1:-${MODEL_ID:-gemini-3.8-flash}}"
PROVIDER="${2:-${PROVIDER:-google}}"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DAEMON_NAME="model-cli-auth-launcher"

if [ -n "${TRACEPARENT:-}" ]; then
  tp_trace=$(echo "$TRACEPARENT" | cut -d'-' -f2 2>/dev/null || true)
  tp_parent=$(echo "$TRACEPARENT" | cut -d'-' -f3 2>/dev/null || true)
  [ -z "$TRACE_ID" ] && [ -n "$tp_trace" ] && TRACE_ID="$tp_trace"
  [ -z "$PARENT_SPAN_ID" ] && [ -n "$tp_parent" ] && PARENT_SPAN_ID="$tp_parent"
fi

if [ -z "$CORRELATION_ID" ]; then
  if [ -r /proc/sys/kernel/random/uuid ]; then
    CORRELATION_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || true)"
  fi
  if [ -z "$CORRELATION_ID" ]; then
    CORRELATION_ID="$(od -x /dev/urandom 2>/dev/null | head -1 | awk '{print $2$3"-"$4"-"$5"-"$6"-"$7$8$9}' || date +%s%N)"
  fi
fi

if [ -z "$TRACE_ID" ] || [ "${#TRACE_ID}" -ne 32 ]; then
  TRACE_ID="$(tr -dc 'a-f0-9' < /dev/urandom 2>/dev/null | head -c 32 || printf "%032x" "$$$(date +%s)")"
fi

if [ -z "$SPAN_ID" ] || [ "${#SPAN_ID}" -ne 16 ]; then
  SPAN_ID="$(tr -dc 'a-f0-9' < /dev/urandom 2>/dev/null | head -c 16 || printf "%016x" "$$")"
fi

now_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")"
echo "{\"timestamp\":\"$now_ts\",\"level\":\"info\",\"serviceName\":\"$DAEMON_NAME\",\"environment\":\"${NODE_ENV:-production}\",\"message\":\"Dispatching CLI auth daemon for model '${MODEL_ID}' (provider: ${PROVIDER}, email: ${USER_EMAIL:-none})\",\"traceId\":\"$TRACE_ID\",\"spanId\":\"$SPAN_ID\",\"parentSpanId\":\"$PARENT_SPAN_ID\",\"correlationId\":\"$CORRELATION_ID\"}" >&2

export MODEL_ID PROVIDER IS_STARTUP USER_EMAIL CLIENT_ID CORRELATION_ID TRACE_ID SPAN_ID PARENT_SPAN_ID

FORWARD_ARGS=()
if [ -n "$USER_EMAIL" ]; then
  FORWARD_ARGS+=("--email" "$USER_EMAIL")
fi
if [ -n "$CLIENT_ID" ]; then
  FORWARD_ARGS+=("--client" "$CLIENT_ID")
fi
if [ -n "$CORRELATION_ID" ]; then
  FORWARD_ARGS+=("--correlation-id" "$CORRELATION_ID")
fi
if [ -n "$TRACE_ID" ]; then
  FORWARD_ARGS+=("--trace-id" "$TRACE_ID")
fi
if [ -n "$SPAN_ID" ]; then
  FORWARD_ARGS+=("--span-id" "$SPAN_ID")
fi
if [ -n "$PARENT_SPAN_ID" ]; then
  FORWARD_ARGS+=("--parent-span-id" "$PARENT_SPAN_ID")
fi

case "$MODEL_ID" in
  *claude*)
    exec "${SCRIPTS_DIR}/claude-auth-daemon.sh" "${FORWARD_ARGS[@]}"
    ;;
  *gpt*|*chatgpt*|*codex*|*openai*)
    exec "${SCRIPTS_DIR}/chatgpt-auth-daemon.sh" "${FORWARD_ARGS[@]}"
    ;;
  *copilot*)
    exec "${SCRIPTS_DIR}/copilot-auth-daemon.sh" "${FORWARD_ARGS[@]}"
    ;;
  *gemini*|*antigravity*|*google*|*)
    exec "${SCRIPTS_DIR}/antigravity-auth-daemon.sh" "${FORWARD_ARGS[@]}"
    ;;
esac
