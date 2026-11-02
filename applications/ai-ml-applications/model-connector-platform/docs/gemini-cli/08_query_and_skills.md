# Gemini CLI — Query, Prompting & Skills Architecture

## 1. Overview

Gemini CLI provides a structured **Skills Architecture** to encapsulate domain-specific instructions, workflows, specialized prompts, and script runners into modular, reusable packages. Skills are discovered dynamically and injected into the model's system context when invoked or matched against user queries.

---

## 2. Skills Directory Structure

Skills are discovered from three hierarchical scopes:
1. **Workspace Scope**: `.agents/skills/<skill-name>/` or `.gemini/skills/<skill-name>/` in the repository root.
2. **User Global Scope**: `~/.gemini/skills/<skill-name>/` in the user's home directory.
3. **Built-in System Scope**: Distributed directly with the Gemini CLI distribution binary.

### Skill Anatomy
```
my-custom-skill/
├── SKILL.md                 # Required: Entrypoint with YAML frontmatter + instructions
├── scripts/                 # Optional: Shell, Python, or Node.js helper scripts
├── references/              # Optional: Deep architectural specs & schemas
└── examples/                # Optional: Example inputs and outputs
```

---

## 3. `SKILL.md` Specification

Every skill must define an initial YAML frontmatter followed by step-by-step markdown guidance:

```markdown
---
name: database-migration-validator
description: Validates PostgreSQL and SQLite migration scripts for zero mock data and DDL/DML separation.
version: 1.0.0
tags: [database, sql, ddl, dml, compliance]
author: ModelBox Core Team
---

# Database Migration Validator

## Workflow
1. Inspect the migration SQL file for any mock `INSERT` statements.
2. Confirm that DDL definitions reside in `config/database/ddl/` and DML data resides in `config/database/dml/`.
3. Check for foreign key constraint ordering.
4. Execute validation queries against the isolated test container.
```

---

## 4. Query & Prompting Best Practices

### System Prompt Injections
Skills extend the base system prompt dynamically. When a skill is activated (via explicit slash command `/skills run <name>` or automatic semantic matching), its content is compiled into the instruction envelope.

### Dynamic Skill Management Commands
```bash
# List all discovered skills across workspace and global scopes
/skills list

# Inspect detailed metadata and capabilities of a specific skill
/skills info database-migration-validator

# Explicitly invoke a skill with parameters
/skills invoke database-migration-validator --target=config/database/migrations/V10__cleanup.sql

# Force reload skills index from disk
/skills reload
```

---

## 5. Model Query Optimizations

To maximize response fidelity and minimize token latency:
1. **Few-Shot Exemplars**: Provide explicit input-output pairs in `examples/`.
2. **Negative Constraints**: Clearly enumerate prohibited patterns (e.g. "Do NOT generate mock data or dummy placeholders").
3. **Structured Outputs**: Request responses in standardized schema formats (JSON, JSON Schema, strict TypeScript definitions).
