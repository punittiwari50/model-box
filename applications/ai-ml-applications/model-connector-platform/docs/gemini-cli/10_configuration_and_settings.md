# Gemini CLI — Configuration & Settings

## 1. Overview

Gemini CLI uses a layered configuration system combining command-line flags, environment variables, project-level settings, and user-global defaults.

---

## 2. Configuration Precedence

Settings are evaluated with strict cascading precedence (highest to lowest):
1. **Explicit CLI Flags** (e.g. `--model=gemini-2.5-pro`, `--temperature=0.2`)
2. **Process Environment Variables** (e.g. `GEMINI_MODEL`, `GEMINI_API_KEY`)
3. **Workspace Configuration** (`.gemini/config.json`)
4. **Global User Configuration** (`~/.gemini/config.json`)
5. **System Default Fallbacks**

---

## 3. Configuration File Schema (`config.json`)

```json
{
  "$schema": "https://geminicli.com/schemas/config.v1.json",
  "model": {
    "default": "gemini-2.5-flash",
    "temperature": 0.2,
    "topP": 0.95,
    "maxOutputTokens": 8192
  },
  "auth": {
    "provider": "google-oauth",
    "oauthPort": 8085,
    "keyringStorage": true
  },
  "runtime": {
    "approval": "prompt",
    "telemetry": false,
    "timeoutMs": 60000,
    "sandbox": {
      "enabled": true,
      "isolatedNetwork": true,
      "allowedCommands": ["git", "node", "pnpm", "docker"]
    }
  },
  "logging": {
    "level": "info",
    "dir": ".gemini/logs",
    "format": "jsonl"
  }
}
```

---

## 4. Environment Variables Reference

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Direct API Key for Google AI Studio | *(None)* |
| `GEMINI_MODEL` | Default model alias or resource name | `gemini-2.5-flash` |
| `GEMINI_AUTH_PORT` | Local loopback port for OAuth 2.0 PKCE redirect | `8085` |
| `GEMINI_CONFIG_PATH` | Explicit path to custom configuration file | `~/.gemini/config.json` |
| `GEMINI_APPROVAL_MODE` | Automation safety level (`prompt`, `auto`, `strict`) | `prompt` |
| `HTTP_PROXY` / `HTTPS_PROXY`| Upstream corporate proxy endpoint | *(None)* |
| `NO_PROXY` | Bypass patterns for local loopback (e.g. `localhost,127.0.0.1`) | *(None)* |

---

## 5. Enterprise & Policy Controls

Enterprise administrators can distribute an immutable system configuration file (`/etc/gemini/policy.json` on Linux/macOS or `C:\ProgramData\Gemini\policy.json` on Windows) to enforce:
- Mandatory SSO / OAuth only (disabling raw API keys).
- Whitelisted models (e.g. restricting to enterprise VPC / Vertex AI instances).
- Data loss prevention (DLP) filters on outgoing context ingestion.
- Enforced logging to remote SIEM audit collectors.
