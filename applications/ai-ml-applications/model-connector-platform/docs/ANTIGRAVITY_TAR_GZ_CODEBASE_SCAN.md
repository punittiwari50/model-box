# Antigravity CLI (`antigravity-cli-1.4.12.tar.gz`) Codebase Scan Report

> **Execution Context**: Hermetically scanned inside Docker container `model-connector-service` running Node.js (`v22.23.4`) and Python (`3.11.2`).

## 1. Archive Metadata & File Inventory

- **Archive File**: `antigravity-cli-1.4.12.tar.gz`
- **Archive Size**: 25,616,587 bytes (24.43 MB)
- **SHA256 Checksum**: `91703fe4f2237470e01807a65fbc601b134564fd13a0782b1d50a61ad81aba4c`
- **Total Packed Files**: 15

| File Path | Size (Bytes) | SHA256 Checksum (Truncated) | Type / Purpose |
| :--- | :--- | :--- | :--- |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 1,951 | `da99a212f7f6309e...` | GitHub Issue Template |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | 1,583 | `19bdbc750019b1fb...` | GitHub Issue Template |
| `agy-cli-demo.gif` | 25,382,285 | `bb340fb34c40a50c...` | Binary Asset (Image/GIF) |
| `CHANGELOG.md` | 188,570 | `20d80b99c1b921c2...` | Documentation |
| `examples/statusline/images/statusline-default.png` | 42,985 | `a97e4d16d9cd5560...` | Binary Asset (Image/GIF) |
| `examples/statusline/images/statusline-review.png` | 42,941 | `51ef1e471ef485b6...` | Binary Asset (Image/GIF) |
| `examples/statusline/images/statusline-tool.png` | 39,476 | `2b212dcb8bb25d55...` | Binary Asset (Image/GIF) |
| `examples/statusline/README.md` | 1,146 | `4f859fb6c4abf5dd...` | Documentation |
| `examples/statusline/statusline.sh` | 5,756 | `5704acdce3b560d8...` | Shell Script |
| `examples/title/images/title-idle.png` | 30,736 | `1e5d90239aade0f2...` | Binary Asset (Image/GIF) |
| `examples/title/images/title-review.png` | 34,686 | `6ab40faa409614ca...` | Binary Asset (Image/GIF) |
| `examples/title/images/title-tool-confirmation.png` | 34,078 | `046f9e41ab0fe2be...` | Binary Asset (Image/GIF) |
| `examples/title/README.md` | 1,170 | `c9772d21eb14cd0b...` | Documentation |
| `examples/title/title.sh` | 791 | `ae7bc8e98e88bfea...` | Shell Script |
| `README.md` | 3,099 | `b92e6a7dfd8b0db2...` | Documentation |

---

## 2. File-by-File Analysis

### 2.1 `README.md` (Product & Capabilities Overview)
- **Description**: Introduces the Antigravity CLI as a keyboard-driven TUI powered by the shared core agent engine with Antigravity 2.0.
- **Architecture Comparison**:
  - *Antigravity CLI*: Optimized for terminal speed, low memory overhead, SSH remote sessions.
  - *Antigravity 2.0*: Full GUI desktop application for visual orchestration and project management.
- **Installation Vectors**:
  - macOS / Linux: `curl -fsSL https://antigravity.google/cli/install.sh | bash`
  - Windows PowerShell: `irm https://antigravity.google/cli/install.ps1 | iex`
  - Windows CMD: `curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd`
- **Authentication Defaults**:
  - System keyring for credential storage, falling back to Google Sign-In.
  - Auto browser launch on local machines; prints authorization URL on remote SSH sessions.
  - Session termination via `/logout`.
- **Compliance & Privacy**: Outlines Terms of Service and user data collection opt-out.

### 2.2 `CHANGELOG.md` (Version History & Auth Evolution)
- **Total Document Lines**: 1,166
- **Auth & Credential Mentions**: 73 entries
- **Key Authentication Milestones**:
  - **Google Cloud & Subscription Choice**: Added choice between Gemini Subscription and Pay-As-You-Go after sign-in.
  - **ADC Integration (`AGY_ADC_AUTH`)**: Full support for Application Default Credentials and Vertex AI.
  - **Third-Party Model Access**: Supports Claude 3.5 Sonnet & Claude 3.5 Opus when authorized in Google Cloud.
  - **Strict Enterprise Privacy**: Telemetry is forced permanently `off (disabled)` for Business / ADC accounts.
  - **Keyring Resilience**: If enterprise tokens exceed OS keychain size limits (macOS/Windows), credentials fall back to private encrypted file storage.
  - **Multi-Tenant Protection**: Plugin and MCP OAuth tokens are isolated strictly per-user to prevent token sharing on multi-user machines.
  - **Proactive Refresh**: Refreshes OAuth tokens 5 minutes prior to expiry to eliminate mid-session interruptions.
  - **Headless SSH Support**: Detects SSH environments and prints URL for external browser verification.

### 2.3 `examples/statusline/statusline.sh` (Terminal Status Integration)
- **Input Format**: Reads single-pass JSON payload via `jq`:
  - `agent_state` (`idle`, `thinking`, `working`, `tool_confirmation`, `review`)
  - `context_window.used_percentage` (numeric percentage)
  - `vcs.branch` and `vcs.dirty` (Git state)
  - `sandbox.enabled` (Boolean sandbox indicator)
  - `subagents`, `task_count`, `artifact_count`
  - `model.display_name` (e.g. Gemini / Claude model)
- **Output**: Renders ANSI color-coded TUI status bar.

### 2.4 `examples/title/title.sh` (Terminal Title Dynamic Management)
- **State Machine**: Updates terminal tab title via OSC escape codes (`\033]0;...\007`):
  - `idle`: `Antigravity CLI (Idle)`
  - `thinking`: `Antigravity CLI (Thinking...)`
  - `working`: `Antigravity CLI (Executing...)`
  - `review`: `Antigravity CLI (Review Changes)`
  - `tool_confirmation`: `Antigravity CLI (Waiting for Confirmation)`

---

## 3. Discovered Configuration & Environment Variables

| Variable Name | Classification | Functional Role |
| :--- | :--- | :--- |
| `AGY_ADC_AUTH` | Environment Variable | Authentication / Identity Provider Control |
| `AGY_CLI_CMD_OUTPUT_PERCENTAGE` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |
| `AGY_CLI_DISABLE_ESCAPE_SEQUENCE_OPTIMIZATIONS` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |
| `AGY_CLI_DISABLE_LATEX` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |
| `AGY_CLI_HIDE_ACCOUNT_INFO` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |
| `AGY_CLI_HIDE_LOGO` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |
| `AGY_ERROR` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |
| `GEMINI_API_KEY` | Environment Variable | Authentication / Identity Provider Control |
| `GOOGLE_GEMINI_BASE_URL` | Environment Variable | CLI Behavior / Telemetry / Display Formatting |

---

## 4. Key Interactive Slash Commands Discovered

| Slash Command | Category | Functionality |
| :--- | :--- | :--- |
| `/login` (or `/signin`) | Authentication | Prompts interactive Google / ADC login flow |
| `/logout` (or `/signout`) | Authentication | Purges stored keyring and file credentials |
| `/config` | Configuration | Displays active account, license tier, and telemetry state |
| `/model` | Model Selection | Displays available models (filtered by project permissions) |
| `/remote-control` | Remote Operations | Manages remote daemon sessions across reboots |
| `/context` | Context Management | Inspects active context window consumption |
| `/diff` | Code Review | Views active code changes with syntax-highlighted tokens |