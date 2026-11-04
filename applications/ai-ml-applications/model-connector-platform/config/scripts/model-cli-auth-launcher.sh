#!/usr/bin/env bash
# ==============================================================================
# Model CLI Authentication Unified Dispatcher / Launcher
# Dispatches model CLI daemon based on modelId or provider (Strategy Pattern)
# Supports two invocation modes:
#   Mode 1: Startup daemon: model-cli-auth-launcher.sh --startup
#   Mode 2: On-Demand model config: model-cli-auth-launcher.sh <modelId> [provider]
# ==============================================================================
set -euo pipefail

IS_STARTUP=false
if [ "${1:-}" = "--startup" ]; then
  IS_STARTUP=true
  shift
fi

MODEL_ID="${1:-${MODEL_ID:-gemini-3.8-flash}}"
PROVIDER="${2:-${PROVIDER:-google}}"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export MODEL_ID PROVIDER IS_STARTUP

case "$MODEL_ID" in
  *claude*)
    exec "${SCRIPTS_DIR}/claude-auth-daemon.sh" "$@"
    ;;
  *gpt*|*chatgpt*|*codex*|*openai*)
    exec "${SCRIPTS_DIR}/chatgpt-auth-daemon.sh" "$@"
    ;;
  *copilot*)
    exec "${SCRIPTS_DIR}/copilot-auth-daemon.sh" "$@"
    ;;
  *gemini*|*antigravity*|*google*)
    exec "${SCRIPTS_DIR}/antigravity-auth-daemon.sh" "$@"
    ;;
  *)
    # Default fallback to Antigravity
    exec "${SCRIPTS_DIR}/antigravity-auth-daemon.sh" "$@"
    ;;
esac
