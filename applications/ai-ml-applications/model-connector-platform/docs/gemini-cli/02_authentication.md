# Gemini CLI Authentication Architecture

## 1. Overview
The Gemini CLI authentication system supports multi-mode identity providers tailored for individual developers, corporate cloud environments, and headless automated runners.

### Official Source Reference
- **Upstream Documentation**: [Gemini CLI authentication setup | Gemini CLI](https://geminicli.com/docs/get-started/authentication/)

---

## 2. Authentication Methods Supported

### 2.1 Sign in with Google (OAuth 2.0 PKCE — Recommended for Individuals)
- **Target Audience**: Free tier users, Google AI Pro, Google AI Ultra, and Google One subscribers.
- **Google Cloud Project**: **Not Required**. Users authenticate directly with their personal Google Account.
- **CLI Command**:
  ```bash
  gemini auth login --browser
  ```
- **Loopback Redirect Protocol**:
  1. The CLI starts a local loopback HTTP server on `http://localhost:8085/oauth2callback`.
  2. Opens the user's default browser to:
     ```
     https://accounts.google.com/o/oauth2/v2/auth?
       redirect_uri=http://localhost:8085/oauth2callback&
       response_type=code&
       scope=https://www.googleapis.com/auth/generative-language openid email profile&
       access_type=offline&
       prompt=select_account consent
     ```
     OAuth client metadata is resolved at runtime from the database and is intentionally not persisted in docs or source files.
  3. The `prompt=select_account consent` parameter forces Google's account selection modal, allowing the user to select which Google identity to authorize.
  4. Google redirects to `http://localhost:8085/oauth2callback?code=...`.
  5. The CLI exchanges the authorization code for an OAuth 2.0 Bearer access token and refresh token, stored securely in the local operating system vault / credentials cache.

---

### 2.2 Google AI Studio API Key (`GEMINI_API_KEY`)
- **Target Audience**: Pay-as-you-go developers and automated headless runners.
- **Setup**: Obtain an API key from Google AI Studio (`aistudio.google.com`).
- **Configuration**:
  ```bash
  export GEMINI_API_KEY="<RUNTIME_ONLY>"
  # or configure in settings:
  gemini config set api_key "<RUNTIME_ONLY>"
  ```

---

### 2.3 Google Cloud Vertex AI (Enterprise Mode)
- **Target Audience**: Corporate enterprise environments with SOC2/HIPAA compliance and Google Cloud VPC boundaries.
- **Requirements**:
  - `GOOGLE_CLOUD_PROJECT`: Active GCP project ID.
  - `GOOGLE_CLOUD_LOCATION`: Regional endpoint (e.g. `us-central1`).
  - Google Cloud Application Default Credentials (ADC) or service account JSON:
    ```bash
    gcloud auth application-default login
    # or
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
    ```

---

### 2.4 Switching Authentication in Interactive Mode
Within the Gemini CLI REPL shell:
```
/auth
```
Opens an interactive menu allowing instant switching between Personal Google Sign-In, API Key, and Vertex AI.
