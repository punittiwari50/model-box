# CLI & Multi-Provider OAuth Authentication Architecture

## 1. Overview & References

This specification details the architecture, design patterns, and manual testing procedures for CLI-based and OAuth 2.0 PKCE authentications in ModelBox Studio.

### Normative Standards & Documentation References
- **Official Gemini CLI Documentation**: [Gemini CLI Documentation](https://geminicli.com/docs/)
- **Gemini CLI Authentication Setup for Individual Google Accounts**: [Gemini CLI authentication setup | Gemini CLI](https://geminicli.com/docs/get-started/authentication/)
- **OAuth 2.0 for Native & Desktop Applications**: RFC 8252 (Loopback IP redirect `http://localhost:8085/oauth2callback`)
- **Engineering Guidelines**: `GEMINI.md` — Invariant 3 (Strategy Pattern `STD-COD-005`), Invariant 4 (Centralized Constants `STD-COD-002`), Invariant 6 (Resilient Errors `STD-COD-007`).

---

## 2. Gemini CLI Individual Google Accounts Architecture

As specified in the [Gemini CLI authentication setup](https://geminicli.com/docs/get-started/authentication/), individual developers utilizing personal Google Accounts (Gmail, Google AI Pro / Ultra) authenticate directly via the browser without requiring a Google Cloud project or billing account.

### 2.1 The Two Account Categories
1. **Individual Google Accounts (Personal / CLI Mode)**:
   - **Command**: `gemini auth login --browser`
   - **Authentication**: Direct Google Account identity consent.
   - **Google Cloud Project**: Not required.
   - **Scopes**:
     - `https://www.googleapis.com/auth/generative-language`
     - `https://www.googleapis.com/auth/cloud-platform`
     - `openid`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
2. **Enterprise Cloud Projects (Service Account / Enterprise Mode)**:
   - Managed Google Cloud project with Vertex AI API enabled and service-account or OAuth 2.0 Client Credentials.

---

## 3. Account Selection & Loopback Redirection Flow

### 3.1 Account Chooser (`prompt=select_account consent`)
To guarantee that the user is presented with the Google Account selection screen ("Choose an account to continue with...") rather than silently defaulting to whichever session is logged in, the authorization URL builder injects:
```
prompt=select_account consent
```
This enables the user to select which Google account to accept and link.

### 3.2 Loopback Redirection Listener (`http://localhost:8085/oauth2callback`)
1. User clicks **"Redirect to Google Authorization Site"**.
2. A new browser tab opens (`window.open(authUrl, "_blank")`).
3. User selects their Google account and authorizes permissions.
4. Google redirects to `http://localhost:8085/oauth2callback?code=...`.
5. The loopback server (`OAuthCallbackServer.ts` on port 8085) receives the authorization code, performs the token exchange, and fetches the user's profile (`https://www.googleapis.com/oauth2/v2/userinfo`).
6. The browser tab displays a success completion card and sends a cross-window `postMessage` (`MODELBOX_OAUTH_SUCCESS`) to the parent window.
7. `ModelAccountsModal.tsx` receives the event and auto-fills:
   - Account Name: `Google Cloud / Gemini (<email>)`
   - User Email: `<email>`
   - Credential Value: `<accessToken>`
   - Active Session: Live authorized status.

---

## 4. Design Pattern: Strategy & Registry Architecture

Instead of conditional branching (`if (provider === "google")`), the platform utilizes the **Strategy Pattern** (`STD-COD-005`):

```
+-------------------------------------------------------------+
|                     IOAuthProviderStrategy                   |
+-------------------------------------------------------------+
| + id: string                                                |
| + name: string                                              |
| + cliCommand: string                                        |
| + defaultScopes: string                                     |
| + buildAuthorizationUrl(params): string                     |
| + parseCallbackUrl(url): ParsedOAuthResponse                |
+-------------------------------------------------------------+
         ▲                  ▲                  ▲
         |                  |                  |
+------------------+ +------------------+ +-------------------+
| GoogleGemini...  | | AnthropicClaude..| | xAiGrokStrategy   |
+------------------+ +------------------+ +-------------------+
```

### Supported Providers & CLI Commands
| Provider | Default CLI Command | Authorization Endpoint | Scopes |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `gemini auth login --browser` | `accounts.google.com/o/oauth2/v2/auth` | `cloud-platform openid email profile` |
| **Anthropic Claude** | `claude auth login` | `claude.ai/oauth/authorize` | `user:inference org:models` |
| **OpenAI ChatGPT** | `chatgpt auth login` | `auth.openai.com/oauth/authorize` | `openid profile model.request` |
| **xAI Grok** | `grok auth login` | `auth.x.ai/oauth/authorize` | `grok.chat model:reasoning` |
| **GitHub Copilot** | `gh auth login` | `github.com/login/oauth/authorize` | `read:user copilot` |

---

## 5. Manual Testing & Verification Workflow

### 5.1 Manual Verification Input
When conducting manual verification or operating in headless / container environments where loopback ports might be shielded:
1. Copy the full redirect URL (e.g. `http://localhost:8085/oauth2callback?code=4/0Af...`) or the raw authorization code from the browser address bar.
2. Paste the string into the **"Manual Authentication Verification & URL Testing"** input field.
3. Click **"⚡ Verify & Auto-Fill"**.
4. The system validates the code against the provider endpoint, extracts user profile information, and populates the credentials.

### 5.2 Test Connection Query (`Hi , whats date time now ?`)
1. Before saving, enter a query into the **"Connection Verification Prompt"** input. Default:
   ```
   Hi , whats date time now ?
   ```
2. Click **"🧪 Test Connection"**.
3. The model returns structured output:
   - **UTC Timestamp**: e.g. `Sun, 25 Oct 2026 15:11:59 GMT`
   - **ISO 8601**: `2026-10-25T15:11:59.833Z`
   - **Local Date & Time**: `Sunday, October 25, 2026 at 03:11:59 PM`
   - **Latency**: `< 100ms`
   - **Token Consumption Breakdown**: Total tokens, Prompt tokens, Completion tokens.

---

## 6. Chat Page Features (Category Grouping, Recommendations & Metrics)

In the Chat interface (`DesktopChatPage` and `MobileChatPage`):
1. **Category-Wise Model Selector**: Models are organized under `<optgroup>` labels:
   - `✦ Google Gemini` (e.g., `gemini-3.8-flash`, `gemini-3.5-flash`)
   - `🧠 Anthropic Claude` (e.g., `claude-3-7-sonnet`, `claude-3-5-haiku`)
   - `🤖 OpenAI ChatGPT` (e.g., `gpt-4o`, `gpt-4o-mini`)
   - `⚡ xAI Grok` (e.g., `grok-beta`)
   - `🛡️ Local Fallback (Ollama)` (e.g., `llama3.2`, `tinyllama`)
2. **Model Selection Recommendation Guide**:
   - Displays a recommendation badge and rationale explaining why a model should be selected (e.g., `gemini-3.8-flash` is recommended for sub-200ms multimodal inference, live date/time queries, and cost-free CLI OAuth).
3. **Active Authentication Indicator**:
   - Displays `AUTH: CLI OAUTH (user@domain.com)` when configured, or `AUTH: Not Configured (Click to Setup)` with a shortcut button to Model Config.
4. **Token Consumption Metric**:
   - Total session tokens consumed counter displayed in the top header and inspector.
   - Per-message token count badge on assistant cards.
