# Antigravity CLI (v1.4.12) Authentication Guide & Specification

## 1. Overview & Architecture

Antigravity CLI (`agy`) v1.4.12 provides terminal-first AI agent capabilities powered by the Google DeepMind core agent engine. Authentication in `agy` is designed for hybrid developer environments, seamlessly handling local interactive desktops, remote headless SSH sessions, and enterprise cloud infrastructure.

The CLI codebase implements four distinct authentication channels:
1. **Interactive Google Sign-In (Default / Personal Accounts)**: OAuth 2.0 PKCE with OS Keyring integration.
2. **Application Default Credentials (`AGY_ADC_AUTH`)**: Google Cloud Project / Service Account integration for enterprise and business tiers.
3. **Gemini API Key (`GEMINI_API_KEY`)**: Headless and CI/CD automated invocation.
4. **Plugin & MCP Server Authentication (`auth.json`)**: Namespaced multi-user credential storage for extensible integrations.

---

## 2. Authentication Channels & Core Implementation

### 2.1 Channel 1: Interactive Google Sign-In (Local & Remote)
* **Local Terminal Sessions**:
  * Running `agy` without an active session initiates Google OAuth.
  * Spawns a local loopback callback server and automatically opens the user's default web browser to the Google OAuth consent screen.
  * Tokens (`access_token`, `refresh_token`, expiration) are stored in the OS system keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service).
  * **Fallback Storage**: If an enterprise token exceeds the OS keychain storage size limit, `agy` transparently falls back to an encrypted private secrets file in `~/.gemini/antigravity-cli/`.
  * **Proactive Refresh**: Refreshes OAuth tokens automatically 5 minutes prior to expiration to prevent mid-session drops.
* **Remote / SSH Terminal Sessions**:
  * The CLI inspects environment variables (`SSH_CLIENT`, `SSH_TTY`, `SSH_CONNECTION`).
  * In headless SSH mode, it suppresses browser launch and renders an authorization URL directly in the terminal.
  * The user opens the URL on their local machine, authorizes the session, and pastes the verification handshake back to the terminal.

### 2.2 Channel 2: Application Default Credentials (`AGY_ADC_AUTH`)
* **Environment Variable**: `AGY_ADC_AUTH=true` or set via Google Cloud SDK (`gcloud auth application-default login`).
* **Google Cloud Project Onboarding**:
  * Connects directly to Google Cloud projects with Vertex AI API enabled.
  * Presents billing options: **Gemini Subscription** or **Pay-As-You-Go**.
  * Dynamic model filtering: Third-party models (e.g., Claude 3.5 Sonnet, Claude 3.5 Opus) are displayed in `/model` only if authorized in the target GCP project.
* **Security & Privacy Governance**:
  * Telemetry is permanently disabled (`off (disabled)`) for Business/ADC accounts.
  * Zero user prompts, codebase contents, or inference outputs are collected.

### 2.3 Channel 3: Direct API Key (`GEMINI_API_KEY`)
* **Configuration**: Set `GEMINI_API_KEY=<token>` in the environment or `.env` file.
* **Usage**: Ideal for lightweight script automation, Docker containers, and CI pipelines without web browsers.
* **Capabilities**: Supports selectable reasoning effort on supported Gemini models (`gemini-2.5-pro`, `gemini-2.5-flash`).

### 2.4 Channel 4: Plugin & MCP Server Authentication
* Configured in plugin manifests via `auth.json`.
* Supports `"optional": true` for providers that can run unauthenticated at base rate limits.
* Stores OAuth tokens scoped strictly to the signed-in user account, preventing cross-user token leakage on multi-user workstations.

---

## 3. Step-by-Step Instructions: Using CLI Authentication

### Step 1: Starting the Interactive Login
To log in or switch accounts from inside any session:
```bash
# In the CLI prompt, invoke the slash command:
/login
```
Or start the CLI directly from the shell:
```bash
agy
```

### Step 2: Completing Browser Consent
1. Select **Sign in with Google** from the interactive menu.
2. When the browser launches, select your Google Account and approve permissions.
3. Once the success screen appears (`Sign-in complete`), return to the terminal. The statusline will update to `● READY`.

### Step 3: Authenticating in Headless / Remote SSH Sessions
When connected over SSH:
```bash
agy
```
1. Copy the displayed URL: `https://accounts.google.com/o/oauth2/v2/auth?...`
2. Open the URL in your local browser and sign in.
3. Copy the resulting response code and paste it back into your remote terminal prompt.

### Step 4: Authenticating via Google Cloud ADC (Enterprise / Business)
```bash
# Set ADC authentication mode
export AGY_ADC_AUTH=true

# Launch CLI and select your Google Cloud Project
agy
```
Choose your billing preference (Subscription or Pay-As-You-Go) and pick your designated Google Cloud Project.

### Step 5: Managing Session & Signing Out
* **Check Status**: Run `/config` or inspect the bottom statusline to view your active account and license tier.
* **Sign Out**:
  ```bash
  /logout
  ```
  This immediately purges tokens from the OS keyring and local cache.

---

## 4. Key CLI Commands & Environment Variables Reference

| Command / Variable | Type | Purpose |
| :--- | :--- | :--- |
| `/login` (or `/signin`) | Slash Command | Opens interactive login dialog and switches active account. |
| `/logout` (or `/signout`)| Slash Command | Purges cached credentials from keychain and disk. |
| `/config` | Slash Command | Inspects session parameters, telemetry status, and account settings. |
| `/model` | Slash Command | Displays and selects available models (filtered by account entitlement). |
| `AGY_ADC_AUTH` | Env Var | Enables Google Cloud Application Default Credentials authentication. |
| `GEMINI_API_KEY` | Env Var | Authenticates directly using a Google Gemini API Key. |
| `AGY_CLI_HIDE_ACCOUNT_INFO` | Env Var | Hides personal email and account identifiers from terminal recordings. |

