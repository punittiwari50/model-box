# Gemini CLI Command Line Interface Reference

## 1. Overview
The Gemini CLI provides a dual-interface architecture: an interactive terminal REPL for exploratory developer workflows, and a headless non-interactive command runner for pipelines, scripts, and pre-commit hooks.

### Official Source Reference
- **Upstream Documentation**: [Gemini CLI Command Reference](https://geminicli.com/docs/)

---

## 2. CLI Execution Modes

### 2.1 Interactive REPL Mode
```bash
gemini [options]
```
Launches the full-screen terminal workbench with syntax highlighting, auto-completion, multi-line editing, and slash command support.

### 2.2 Headless Scripting Mode (`-p` / `--prompt`)
Executes a single prompt non-interactively and exits with standard exit codes:
```bash
gemini -p "Analyze git diff and generate conventional commit message"
```
- **Quiet Mode (`-q`)**: Suppresses decorative banners and spinners for clean piping:
  ```bash
  gemini -q -p "Extract todos from src/main" > todos.txt
  ```

### 2.3 Standard Input Piping
The CLI automatically detects standard input streams:
```bash
git diff | gemini -p "Summarize code changes and potential regressions"
cat build.log | gemini -p "Diagnose root cause of the build failure"
```

### 2.4 Resuming Conversation Sessions (`-r` / `--resume`)
```bash
# Resume the most recent session
gemini -r latest "Now write unit tests for the functions we just created"

# Resume by session identifier
gemini -r "sess_8f29a0b1" "Continue refactoring"
```

---

## 3. Command Flags & Options

| Flag | Long Form | Description | Default |
| :--- | :--- | :--- | :--- |
| `-m <id>` | `--model <id>` | Select target Gemini model | `gemini-3.8-flash` |
| `-p <str>` | `--prompt <str>` | Headless non-interactive query | None (REPL) |
| `-r <id>` | `--resume <id>` | Resume previous session by ID or `latest` | None |
| `-q` | `--quiet` | Suppress spinner and styling for shell scripts | `false` |
| `-s` | `--stream` | Toggle token streaming output | `true` |
| `--temperature` | `--temperature <float>` | Sampling temperature (0.0 to 2.0) | `0.7` |
| `--max-tokens` | `--max-tokens <int>` | Maximum completion tokens | `8192` |
| `--system <str>`| `--system-instruction` | Override system prompt context | None |
| `--config <path>`| `--config-file <path>` | Load specific custom config file | `~/.gemini/config.json` |
