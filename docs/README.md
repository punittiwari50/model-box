# ModelBox Documentation

## 1. Purpose

This directory is the single source of truth for runtime operations and endpoint usage.

## 2. Documentation Catalogue

| Document | Purpose | Format |
|---|---|---|
| [Docker Operations Guide](docker-operations.md) | Docker runtime lifecycle and model operations | Purpose / Command / Output |
| [Docker Operations Runbook](docker-operations-runbook.md) | Detailed lifecycle runbooks, rebuild flows, and governance extensions | Procedure / Validation |
| [Ollama Endpoint Guide](ollama-endpoints.md) | Endpoint selection, model mapping, and request templates | Purpose / Command / Output |

## 3. Governance Rules

1. Keep core Docker runtime commands and policies in the [Docker Operations Guide](docker-operations.md).
2. Keep detailed lifecycle runbooks and extended checklists in the [Docker Operations Runbook](docker-operations-runbook.md).
3. Keep endpoint behavior and request templates only in the [Ollama Endpoint Guide](ollama-endpoints.md).
4. Keep repository architecture and decision notes in the [Repository Overview](../README.md).
5. Use [CODEOWNERS](../CODEOWNERS) for default ownership.
6. Use [SECURITY.md](../SECURITY.md) for vulnerability reporting and secret policy.
7. Keep procedures tool-neutral: every operational step must be executable with shell commands.
8. Governance applies equally to human operators, scripted automation, and AI-assisted workflows.
9. Keep docs concise and enterprise-maintainable: target <= 250 lines per Markdown file; split into focused docs if a file grows beyond that.

## 4. Build and validation status

| Build target | Status | Notes |
|---|---|---|
| Ollama runtime | Success | Compose stack starts and exposes the API on localhost |
| Compose config validation | Success | `docker compose config` renders correctly |
| GitHub workflow validation | Configured | CI workflow added for future automated verification |
| Documentation health | Success | Core docs are centralized and indexed |
| Security governance | Configured | Ownership and vulnerability reporting are now defined |

## 5. Enterprise Documentation Controls

1. Migration-only documents are not kept unless an active migration project exists.
2. Duplicated operational steps should be merged into one authoritative document.
3. References must point to executable terminal procedures, not tool-specific narratives.

## 6. Remaining Enterprise-Grade Gaps

The current repository is a strong runtime baseline for local or controlled internal use, but the following items still prevent a full enterprise-grade production classification:

1. CI/CD validation: no automated pipeline for Compose validation, smoke testing, or image drift checks.
2. Security governance: no formal security policy, secret handling standard, or branch protection / review controls.
3. Environment separation: no explicit dev, staging, and production configuration model for ports, secrets, and resource profiles.
4. Observability and alerting: health checks exist, but there is no metrics, log retention, alerting, or operational dashboard layer.
5. Backup and restore: model persistence is present, but a formal backup, restore, and disaster-recovery process is not yet defined.
6. Upgrade and rollback contract: image pinning is improved, but there is no formal release checklist, rollback plan, or change approval process.
7. Model governance: model versioning is documented, but not enforced through automation or release controls.
8. Operational ownership: there is no clear on-call ownership model, support process, or incident response workflow.

## 7. Authoritative References

- [Ollama Docker Hub image](https://hub.docker.com/r/ollama/ollama)
- [Ollama official site](https://ollama.com)
