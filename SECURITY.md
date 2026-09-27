# Security Policy

Repository owner: @punit

## Supported Versions

This project is currently maintained for the latest repository state and the active Ollama runtime configuration in the Docker Compose stack.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Report suspected security issues privately to the repository maintainers via @punit or the repository security contact.

Include:

- a summary of the issue
- affected files or paths
- reproduction steps or proof of concept
- impact assessment
- suggested remediation

## Secret Handling

- Do not commit real secrets, tokens, or credentials.
- Use `.env.example` as the template for non-secret configuration.
- Keep local runtime files such as `.env` outside source control.
- Rotate any exposed credentials immediately if they were accidentally committed.

## Dependency and Image Hygiene

- Prefer pinned image digests for runtime immutability.
- Review Docker image updates before deployment.
- Validate Compose configuration after changes.

## Branch Protection Baseline

To prevent vulnerable dependencies from being merged, protect the default branch and require the dependency security workflow check to pass before merge.

- Workflow file: `.github/workflows/gatling-dependency-security.yml`
- Required check: `owasp-dependency-check`
- Recommended merge rules:
- Require pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Restrict force pushes and branch deletion

## Response Expectations

Security reports will be reviewed as quickly as possible and triaged based on severity and impact.
