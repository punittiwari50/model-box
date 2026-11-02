# Gemini CLI Architecture, Capabilities & Knowledge Cutoff

## 1. Overview
The **Gemini CLI** (`@google/gemini-cli`) is Google's open-source terminal-native AI agent and reasoning engine designed to bring frontier Gemini models directly into developer workflows, command lines, and automated CI/CD pipelines.

### Official Source Reference
- **Upstream Documentation**: [Gemini CLI Documentation](https://geminicli.com/docs/)
- **Installation**: `npm install -g @google/gemini-cli`
- **Antigravity CLI Evolution**: In accordance with Google's official transition announcement (June 18, 2026), Gemini CLI workflows transition to Antigravity CLI (`agy`) for advanced frontier models (such as Gemini 4 Argon), while maintaining native backward-compatible execution for Gemini 3.8 Flash, 3.5 Flash, and 2.0 series.

---

## 2. Knowledge Cutoff & Model Context Window Matrix

| Model Tier | Model Identifier | Knowledge Cutoff | Context Window | Default Output Limit | Recommended Primary Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.8 Flash** | `gemini-3.8-flash` | **March 2026** | **1,048,576 tokens** (1M) | 8,192 tokens | Lightning-fast (<200ms) multi-turn reasoning, structured tool outputs, live date/time queries |
| **Gemini 3.5 Flash** | `gemini-3.5-flash` | **March 2026** | **1,048,576 tokens** (1M) | 8,192 tokens | High-throughput batch streaming, AST parsing, background tasks |
| **Gemini 3.5 Flash Lite** | `gemini-3.5-flash-lite` | **March 2026** | **1,048,576 tokens** (1M) | 4,096 tokens | Ultra-low latency, edge invocations, automated lint checking |
| **Gemini 2.0 Flash** | `gemini-2.0-flash` | **August 2024** | **1,048,576 tokens** (1M) | 8,192 tokens | Multimodal audio/video stream processing, native tool execution |
| **Gemini 1.5 Pro** | `gemini-1.5-pro` | **November 2024** | **2,097,152 tokens** (2M) | 8,192 tokens | Massive codebase analysis, deep architectural review |
| **Gemini 4 Argon** | `gemini-4-argon` | **June 2026** | **2,097,152 tokens** (2M) | 16,384 tokens | Antigravity CLI native agent workflows, automated repository refactoring |

---

## 3. Core Architectural Capabilities
1. **Interactive REPL Mode**: Real-time terminal chat with syntax highlighting, streaming token generation, and command completion.
2. **Headless Scripting (`-p`)**: Non-interactive command invocation for automation scripts and git hooks.
3. **Standard Input Piping (`cat | gemini`)**: Pipe compiler logs, git diffs, or JSON payloads into the CLI.
4. **Context Injection (`@file` and `@dir`)**: Direct in-prompt reference to workspace files and directories.
5. **Agent Skills Framework**: Modular tool and script packages loaded dynamically from `.gemini/skills/` on demand without context bloat.
6. **Multi-Turn Session Lineage**: Persistence of session state across terminal restarts with resume capability (`-r`).
