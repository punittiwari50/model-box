# Gemini CLI Authorization, Scopes & Governance

## 1. Overview
Authorization governs the boundaries of what the Gemini CLI is permitted to access, generate, execute, and store.

### Official Source Reference
- **Upstream Documentation**: [Gemini CLI Security & Policies](https://geminicli.com/docs/)

---

## 2. OAuth 2.0 Scopes Specification

When authenticating via Google Sign-In, the CLI requests the following minimal, least-privilege scopes:

| Scope URI | Scope Name | Justification |
| :--- | :--- | :--- |
| `https://www.googleapis.com/auth/generative-language` | Generative Language API | Invoking Gemini model inference, streaming tokens, embedding generation |
| `openid` | OpenID Connect | Authenticated user verification across OAuth 2.0 PKCE handshakes |
| `https://www.googleapis.com/auth/userinfo.email` | User Email | Identifying user account and linking local project sessions to email identity |
| `https://www.googleapis.com/auth/userinfo.profile` | User Profile | Retrieving display name and account avatar for UI/CLI prompt badges |
| `https://www.googleapis.com/auth/cloud-platform` *(Optional)* | Google Cloud Platform | Required exclusively when accessing Vertex AI model endpoints via GCP projects |

---

## 3. Account Chooser & Consent Prompt Enforcement

In multi-account developer environments, defaulting to an active ambient browser session can inadvertently bind enterprise queries to personal accounts or vice versa.

To enforce deterministic, explicit authorization:
```
prompt=select_account consent
```
- **`select_account`**: Forces the Google Account Chooser screen to be rendered even if the developer already has active sessions in Google Chrome.
- **`consent`**: Forces the permission grant dialog, ensuring newly added or rotated scopes are explicitly reviewed and acknowledged.

---

## 4. Enterprise Administrative Governance & Policy Locks

Enterprise administrators can configure system-wide policies (`/etc/gemini/config.json` or Windows Registry) to restrict authentication choices:
- `auth.allowed_modes`: Array restricting allowed auth types (e.g. `["vertex-ai"]` to forbid personal accounts in corporate repositories).
- `auth.enforce_project`: Mandates a specific Google Cloud billing project for all CLI executions.
- `telemetry.enabled`: Controls whether anonymous telemetry is dispatched to Google servers.
