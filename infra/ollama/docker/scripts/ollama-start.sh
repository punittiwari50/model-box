#!/bin/sh
set -eu

(set -o pipefail) >/dev/null 2>&1 && set -o pipefail || true

OLLAMA_APP_NAME="ollama-runtime"
OLLAMA_LOG_FILE="${LOG_FILE:-/tmp/ollama.log}"
OLLAMA_APP_UID="${OLLAMA_APP_UID:-10001}"
OLLAMA_APP_GID="${OLLAMA_APP_GID:-10001}"
OLLAMA_PRELOAD_MODELS="${OLLAMA_PRELOAD_MODELS:-}"
OLLAMA_MODEL_TAG="${OLLAMA_MODEL:-}"
OLLAMA_ACCELERATION_MODE="${OLLAMA_ACCELERATION_MODE:-auto}"
OLLAMA_GPU_FALLBACK_ENABLED="${OLLAMA_GPU_FALLBACK_ENABLED:-true}"

ollama_timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

ollama_log() {
  printf '[%s] [INFO] %s\n' "$(ollama_timestamp)" "$*" | tee -a "$OLLAMA_LOG_FILE" >&2
}

ollama_warn() {
  printf '[%s] [WARN] %s\n' "$(ollama_timestamp)" "$*" | tee -a "$OLLAMA_LOG_FILE" >&2
}

ollama_error() {
  printf '[%s] [ERROR] %s\n' "$(ollama_timestamp)" "$*" | tee -a "$OLLAMA_LOG_FILE" >&2
}

ollama_parse_arguments() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --log-file)
        OLLAMA_LOG_FILE="${2:-$OLLAMA_LOG_FILE}"
        shift 2
        ;;
      --model)
        OLLAMA_MODEL_TAG="${2:-$OLLAMA_MODEL_TAG}"
        shift 2
        ;;
      --preload-models)
        OLLAMA_PRELOAD_MODELS="${2:-$OLLAMA_PRELOAD_MODELS}"
        shift 2
        ;;
      --acceleration)
        OLLAMA_ACCELERATION_MODE="${2:-$OLLAMA_ACCELERATION_MODE}"
        shift 2
        ;;
      --gpu-fallback)
        OLLAMA_GPU_FALLBACK_ENABLED="${2:-$OLLAMA_GPU_FALLBACK_ENABLED}"
        shift 2
        ;;
      --help)
        printf 'Usage: %s [--log-file PATH] [--model MODEL_TAG] [--preload-models "tag1,tag2"] [--acceleration auto|gpu|cpu] [--gpu-fallback true|false]\n' "$0"
        exit 0
        ;;
      *)
        printf 'Unknown argument: %s\n' "$1" >&2
        exit 2
        ;;
    esac
  done
}

ollama_prepare_runtime() {
  if [ "$(id -u)" -ne 0 ]; then
    return 0
  fi

  mkdir -p /tmp/.ollama/cache /workspace

  chown "${OLLAMA_APP_UID}:${OLLAMA_APP_GID}" /tmp/.ollama /tmp/.ollama/cache /workspace 2>/dev/null || true
  chown "${OLLAMA_APP_UID}:${OLLAMA_APP_GID}" /tmp/.ollama/id_ed25519 /tmp/.ollama/id_ed25519.pub 2>/dev/null || true
}

ollama_is_true() {
  case "${1:-}" in
    true|TRUE|True|1|yes|YES|Yes|on|ON|On) return 0 ;;
    *) return 1 ;;
  esac
}

ollama_gpu_runtime_available() {
  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi -L >/dev/null 2>&1 && return 0
  fi

  [ -e /dev/nvidiactl ] && return 0
  [ -d /proc/driver/nvidia ] && return 0
  return 1
}

ollama_pull_if_missing() {
  model_tag="$1"
  if [ -z "$model_tag" ]; then
    return 0
  fi

  if ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -Fxq "$model_tag"; then
    return 0
  fi

  attempt=1
  while [ "$attempt" -le 5 ]; do
    ollama_log "Pulling model: $model_tag (attempt $attempt/5)"
    if ollama pull "$model_tag" 2>&1 | tee -a "$OLLAMA_LOG_FILE"; then
      return 0
    fi

    attempt=$((attempt + 1))
    if [ "$attempt" -le 5 ]; then
      sleep 5
    fi
  done

  ollama_error "Failed to pull model: $model_tag after 5 attempts."
  return 1
}

ollama_preload_models() {
  if ! ollama_wait_for_server 60; then
    ollama_error "Ollama server is not ready for model preload."
    return 1
  fi

  if [ -n "$OLLAMA_PRELOAD_MODELS" ]; then
    for model in $(printf '%s' "$OLLAMA_PRELOAD_MODELS" | tr ',;' '  '); do
      [ -n "$model" ] || continue
      ollama_pull_if_missing "$model"
    done
    return 0
  fi

  if [ -n "$OLLAMA_MODEL_TAG" ]; then
    ollama_pull_if_missing "$OLLAMA_MODEL_TAG"
  fi
}

ollama_wait_for_server() {
  attempts="${1:-60}"
  i=0

  while [ "$i" -lt "$attempts" ]; do
    if ollama list >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done

  return 1
}

ollama_start_server() {
  run_mode="$1"

  case "$run_mode" in
    cpu)
      export OLLAMA_LLM_LIBRARY=cpu
      ollama_log "Starting Ollama server in CPU mode..."
      ;;
    gpu)
      unset OLLAMA_LLM_LIBRARY
      ollama_log "Starting Ollama server with GPU-preferred runtime..."
      ;;
    *)
      unset OLLAMA_LLM_LIBRARY
      ollama_log "Starting Ollama server..."
      ;;
  esac

  ollama serve >>"$OLLAMA_LOG_FILE" 2>&1 &
  echo $!
}

ollama_start() {
  requested_mode="$(printf '%s' "$OLLAMA_ACCELERATION_MODE" | tr '[:upper:]' '[:lower:]')"

  case "$requested_mode" in
    cpu)
      server_pid="$(ollama_start_server cpu)"
      if ! ollama_wait_for_server 60; then
        ollama_error "Ollama server failed to start in CPU mode."
        exit 1
      fi
      ollama_preload_models
      wait "$server_pid"
      ;;
    gpu)
      server_pid="$(ollama_start_server gpu)"
      if ollama_wait_for_server 60; then
        ollama_preload_models
        wait "$server_pid"
        exit 0
      fi
      if ollama_is_true "$OLLAMA_GPU_FALLBACK_ENABLED"; then
        ollama_warn "GPU startup failed; falling back to CPU runtime."
        server_pid="$(ollama_start_server cpu)"
        if ! ollama_wait_for_server 60; then
          ollama_error "Fallback CPU server failed to start."
          exit 1
        fi
        ollama_preload_models
        wait "$server_pid"
      fi
      ollama_error "GPU startup failed and fallback is disabled."
      exit 1
      ;;
    auto|*)
      if ollama_gpu_runtime_available; then
        server_pid="$(ollama_start_server gpu)"
        if ollama_wait_for_server 60; then
          ollama_preload_models
          wait "$server_pid"
          exit 0
        fi
        if ollama_is_true "$OLLAMA_GPU_FALLBACK_ENABLED"; then
          ollama_warn "GPU runtime failed; falling back to CPU runtime."
          server_pid="$(ollama_start_server cpu)"
          if ! ollama_wait_for_server 60; then
            ollama_error "Fallback CPU server failed to start."
            exit 1
          fi
          ollama_preload_models
          wait "$server_pid"
        fi
        ollama_error "GPU runtime failed and fallback is disabled."
        exit 1
      fi

      ollama_log "No GPU runtime detected; starting in CPU mode."
      server_pid="$(ollama_start_server cpu)"
      if ! ollama_wait_for_server 60; then
        ollama_error "CPU server failed to start."
        exit 1
      fi
      ollama_preload_models
      wait "$server_pid"
      ;;
  esac
}

ollama_main() {
  ollama_prepare_runtime
  ollama_parse_arguments "$@"
  : > "$OLLAMA_LOG_FILE"
  ollama_start
}

ollama_main "$@"