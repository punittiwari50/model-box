#!/bin/bash
set -e

TARGET_URL="${1:-https://www.linkedin.com}"
WORKFLOW_NAME="${2:-LinkedIn Manual Flow}"
OUTPUT_RAW="/app/workflows/linkedin_codegen_raw.js"
OUTPUT_JSON="/app/workflows/linkedin_manual_flow.json"

echo "================================================================="
echo " Starting Interactive Playwright Codegen Recording Server"
echo " Target URL: $TARGET_URL"
echo " Resolution: 1920x1080"
echo " noVNC Port: 6080 (http://localhost:6080/vnc.html)"
echo "================================================================="

# Clean any existing X lock or processes
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true

# 1. Start Xvfb virtual framebuffer
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 1

# 2. Start Fluxbox window manager
DISPLAY=:99 fluxbox &
FLUXBOX_PID=$!
sleep 1

# 3. Start x11vnc server
x11vnc -display :99 -forever -shared -rfbport 5900 -nopw -quiet &
X11VNC_PID=$!
sleep 1

# 4. Start websockify / noVNC
websockify --web /usr/share/novnc/ 6080 localhost:5900 &
WEBSOCK_PID=$!
sleep 1

echo ">>> noVNC web streaming is active at http://localhost:6080/vnc.html <<<"
AUTH_DIR="/app/workflows/auth"
mkdir -p "$AUTH_DIR"
AUTH_FILE="$AUTH_DIR/storage_state.json"

LOAD_ARG=""
if [ -f "$AUTH_FILE" ] && [ -s "$AUTH_FILE" ]; then
  echo "Found existing authentication state at $AUTH_FILE, loading cookies..."
  LOAD_ARG="--load-storage=$AUTH_FILE"
fi

echo "Launching Playwright Codegen on display :99 with bidirectional auth persistence..."
# 5. Launch Playwright codegen
export DISPLAY=:99
npx playwright codegen $LOAD_ARG --save-storage="$AUTH_FILE" --output "$OUTPUT_RAW" --target=javascript "$TARGET_URL" || true

echo "Playwright codegen session ended. Converting raw recording to JSON schema workflow..."

# 6. Convert generated script into JSON schema workflow
if [ -f "$OUTPUT_RAW" ]; then
  node config/scripts/codegen-to-workflow.js "$OUTPUT_RAW" "$OUTPUT_JSON" "$TARGET_URL"
  echo ">>> Workflow JSON schema created at: $OUTPUT_JSON <<<"
else
  echo "No raw codegen output file found."
fi

# Cleanup
kill $WEBSOCK_PID $X11VNC_PID $FLUXBOX_PID $XVFB_PID 2>/dev/null || true
echo "Interactive recording session completed."
