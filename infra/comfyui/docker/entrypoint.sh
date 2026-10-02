#!/bin/bash
set -e

# Ensure comfyui data directories exist with proper permissions for mounted volumes
mkdir -p /data/comfyui/input
mkdir -p /data/comfyui/output
mkdir -p /data/comfyui/user/default

# Do not recurse chmod bind mounts because host filesystem semantics can reject it.
safe_set_dir_perms() {
    local target_dir="$1"
    if [ -d "$target_dir" ] && [ -w "$target_dir" ]; then
        chmod u+rwx "$target_dir" 2>/dev/null || true
    fi
}

safe_set_dir_perms /data/comfyui
safe_set_dir_perms /data/comfyui/input
safe_set_dir_perms /data/comfyui/output
safe_set_dir_perms /data/comfyui/user
safe_set_dir_perms /data/comfyui/user/default

EXTRA_ARGS=()
if [ -n "${COMFYUI_DATABASE_URL:-}" ]; then
    EXTRA_ARGS+=(--database-url "${COMFYUI_DATABASE_URL}")
fi
if [ "${COMFYUI_ENABLE_ASSETS:-0}" = "1" ]; then
    EXTRA_ARGS+=(--enable-assets)
fi

# Activate venv if it exists (GPU build), otherwise run as-is (CPU)
if [ -f "/opt/venv/bin/activate" ]; then
    source /opt/venv/bin/activate
    exec python main.py "${EXTRA_ARGS[@]}" "$@"
else
    # Detect which python to use (python3 for GPU/Ubuntu, python for CPU)
    PYTHON_CMD=python
    if ! command -v python &> /dev/null && command -v python3 &> /dev/null; then
        PYTHON_CMD=python3
    fi
    exec $PYTHON_CMD main.py "${EXTRA_ARGS[@]}" "$@"
fi
