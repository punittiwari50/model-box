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

export MODEL_ID PROVIDER IS_STARTUP USER_EMAIL CLIENT_ID

FORWARD_ARGS=()
if [ -n "$USER_EMAIL" ]; then
  FORWARD_ARGS+=("--email" "$USER_EMAIL")
fi
if [ -n "$CLIENT_ID" ]; then
  FORWARD_ARGS+=("--client" "$CLIENT_ID")
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
