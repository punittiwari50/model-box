# Gemini CLI — File Management & Context Ingestion

## 1. Overview

Gemini CLI provides native file system awareness to ground model queries in local codebases, documentation, configuration files, and assets. By using contextual file references, the CLI automatically reads, tokenizes, and streams local files into the prompt context without requiring manual copying or clipboard staging.

---

## 2. File Reference Syntax

Gemini CLI parses specific sigils in prompt inputs (both interactive REPL and headless `-p` mode):

### `@file <relative-or-absolute-path>`
Loads the exact text or binary representation of a single file into the system or user prompt context block.

```bash
# In headless prompt
gemini -p "Analyze @src/index.ts and propose refactoring for memory efficiency"

# In interactive REPL
> Explain the security model in @config/database/ddl/01_core_schema.sql
```

### `@dir <directory-path>`
Recursively traverses the specified directory, gathers eligible files (filtered by `.geminiignore` and binary exclusions), and packages them as an indexed workspace tree structure.

```bash
# In interactive REPL
> Review all modules in @packages/model-connector-core and generate an architectural map
```

---

## 3. Exclusion Rules & `.geminiignore`

To prevent context exhaustion and avoid leaking secrets or oversized binary assets, Gemini CLI evaluates an acyclic hierarchical exclusion filter:

### Exclusion Precedence
1. Default built-in system ignores (`.git/`, `node_modules/`, `dist/`, `build/`, `.venv/`, `.env`, `*.log`, `*.lock`, `*.pyc`).
2. Project-root `.geminiignore` (follows `.gitignore` syntax).
3. Global user ignore file at `~/.gemini/ignore`.

### Sample `.geminiignore`
```gitignore
# Dependencies & Build Artefacts
node_modules/
dist/
build/
coverage/

# Environment Secrets
.env
.env.*
*.pem
*.key
credentials.json

# Local databases & logs
*.sqlite
*.db
*.log
```

---

## 4. Multi-File Token Optimization & Truncation Strategy

When multiple files are loaded:
1. **Header Metadata Injection**: Each file chunk is demarcated with a clear markdown fence specifying file path, line count, and byte size:
   ````markdown
   --- File: src/main/typescript/engine/ChatEngine.ts (Lines: 1-140, 4.2 KB) ---
   ```typescript
   ...
   ```
   ````
2. **Token Budget Partitioning**: If the total files exceed the model's active context window (e.g. 1,000,000 tokens for Gemini 1.5 Pro / Gemini 2.0 Flash), the CLI triggers an automatic prioritization strategy:
   - Priority 1: Files explicitly specified with `@file`.
   - Priority 2: Non-test source files.
   - Priority 3: Peripheral configs and test suites (summarized or truncated with line-slice ranges).

---

## 5. Binary & Media Asset Handling

Gemini models natively support multimodal ingestion:
- **Images (`.png`, `.jpg`, `.jpeg`, `.webp`)**: Encoded directly as base64 inline image parts using standard MIME types (`image/png`, `image/webp`).
- **PDF Documents (`.pdf`)**: Extracted as document parts for multi-page visual layout and text analysis.
- **Audio & Video (`.mp3`, `.wav`, `.mp4`)**: Processed according to Gemini multimodal input specifications with temporal markers.
