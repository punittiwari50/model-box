# Gemini CLI Cheatsheet & REPL Slash Commands

## 1. Quick Invocation Cheatsheet

```bash
# 1. Quick Question in Terminal
gemini -p "Hi , whats date time now ?"

# 2. Start Full Interactive Workspace
gemini

# 3. Model Override
gemini -m gemini-3.8-flash -p "Explain microservices in 3 bullets"

# 4. Pipe Logs / Git Context
git status | gemini -p "What files were modified?"

# 5. Continue Prior Conversation
gemini -r latest "Add error handling to the code snippet above"

# 6. Authenticate via Google Browser Consent
gemini auth login --browser

# 7. Check Current Identity
gemini auth status
```

---

## 2. Interactive REPL Slash Commands

When inside the interactive `gemini` session, use the following built-in slash commands:

| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/auth` | None | Open interactive modal to change or re-authenticate identity |
| `/skills list` | None | List all discovered built-in, workspace, and user skills |
| `/skills reload` | None | Refresh skills discovered from `.gemini/skills/` |
| `/skills enable <name>` | Skill Name | Enable a specific skill package |
| `/skills disable <name>`| Skill Name | Disable a specific skill package |
| `/agents reload` | None | Re-index autonomous subagents and workflows |
| `/model <name>` | Model ID | Dynamically switch active model (e.g. `/model gemini-3.8-flash`) |
| `/clear` | None | Clear terminal screen and purge conversation history |
| `/history` | None | Display conversation turn lineage and token metrics |
| `/help` | None | Show help, keybindings, and available slash commands |
| `/quit` (or `/exit`) | None | Terminate active REPL session |

---

## 3. Environment Variables Reference

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Direct Google AI Studio API key | `<RUNTIME_ONLY>...` |
| `GOOGLE_API_KEY` | Secondary alias for Google AI Studio API key | `<RUNTIME_ONLY>...` |
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID for Vertex AI execution | `acme-prod-ai` |
| `GOOGLE_CLOUD_LOCATION`| GCP Region endpoint | `us-central1` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key file | `/etc/gcp/key.json` |
| `GEMINI_MODEL` | Default model when not specified by `-m` | `gemini-3.8-flash` |
| `GEMINI_CLI_PORT` | Loopback redirect port for OAuth 2.0 PKCE | `8085` |
| `GEMINI_LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`)| `info` |
