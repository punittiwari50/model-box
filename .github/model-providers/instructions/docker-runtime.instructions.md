# Docker Runtime Instructions

This repository must prefer containerized execution for software runtime tasks.

## Required
- Use Docker for Python, Node.js, Java/JDK, Maven, Gradle, and shell-based project tasks.
- Mount the repo into the container with `-v "${PWD}:/workspace" -w /workspace`.
- Never bind-mount a host home directory such as `/home/<username>`, `C:\Users\<username>`, or `/Users/<username>` into a container for repo work.
- Use official project images such as `python:3.13-slim`, `node:24-alpine`, `eclipse-temurin:27-jdk`, `maven:3.9-eclipse-temurin-27`, and `gradle:8.10-jdk27` for reproducible execution. Use JDK21 images only when the jdk21 suffix build files are explicitly requested.
- Run scripts, dependency installs, and validations inside the container rather than on the host.
- Use a virtual environment inside the Python container session for Python work.
- Use project-local Node/npm execution inside the Node container session.
- Use JDK/Maven/Gradle containers only for Java build and dependency tasks; do not create or start a Node container if the task is Java-only.
- Create only the runtime container needed for the specific task: Python for Python work, Node for Node work, JDK/Maven/Gradle for Java work, not all of them together unless the task explicitly requires it.
- Run containers as a non-root user for least-privilege execution.
- Keep Python, Node, and Java build workloads in separate containers or Compose services so they stay isolated and cleaner.
- Use `docker compose` for stack operations related to the application and services.

## Prohibited
- Running Python or Node project commands directly on the host when a Docker equivalent exists.
- Installing global Python or Node dependencies on the host for repo work.
- Writing project files with non-UTF-8 encodings or garbled characters.
- Deleting unrelated orphaned images, volumes, networks, or BuildKit cache entries that were not created for the current task.

## Cleanup requirement
When a task is complete, remove only the temporary containers, images, networks, and volumes created during the work.

```bash
docker compose down --volumes --remove-orphans
docker rm -f <container-name>
docker rmi <image-name>
docker network rm <network-name>
docker volume rm <volume-name>
```

## Rebuild intent
If the user says `rebuild` (including phrasing like `rebuild project`, `rebuild stack`, or `rebuild app`), interpret it as a full Docker rebuild workflow for the current repository/project in scope.

### Required rebuild scope
- Remove Docker containers related to the current project.
- Remove Docker images related to the current project.
- Remove Docker networks related to the current project.
- Remove Docker volumes related to the current project.
- Remove Docker buildx builders and build cache related to the current project.
- Rebuild and start the current project's container stack again.

### Safety boundary
- Limit deletion to resources clearly related to the active project (name, label, compose project, or known service prefix match).
- Do not delete unrelated global Docker resources.

### Reporting requirement
- After rebuild completes, provide a summary report of the latest Gatling run.
- Resolve the newest run directory by timestamp and summarize key metrics (requests, failures, response times, throughput).
- Prefer sources under `<PERFORMANCE_DOCKER_DIR>/volumes/reports/runs/` when present.

### Example command pattern
```bash
# 1) Stop stack
docker compose down --volumes --remove-orphans

# 2) Remove project-scoped resources (examples; select by current compose project or labels)
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"; docker ps -a --filter "label=com.docker.compose.project=$PROJECT" -q | xargs -r docker rm -f
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"; docker images --filter "label=com.docker.compose.project=$PROJECT" -q | xargs -r docker rmi -f
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"; docker network ls --filter "label=com.docker.compose.project=$PROJECT" -q | xargs -r docker network rm
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"; docker volume ls --filter "label=com.docker.compose.project=$PROJECT" -q | xargs -r docker volume rm
docker buildx prune -f

# 3) Rebuild and start
docker compose build --no-cache
docker compose up -d

# 4) Produce latest Gatling summary from newest run directory
```

## Project Rebuild Checklist
Use this when workflow tasks require a full clean rebuild of the current project's stacks.

Execution context:
```bash
cd <project-root>
```

Checklist:
- [ ] Stop and remove performance stack (containers, volumes, orphans):
```bash
docker compose -f <PERFORMANCE_COMPOSE_FILE> down -v --remove-orphans
```

- [ ] Stop and remove Ollama stack (containers, volumes, orphans):
```bash
docker compose --env-file <OLLAMA_ENV_FILE> -f <OLLAMA_COMPOSE_FILE> down -v --remove-orphans
```

- [ ] Remove unused containers:
```bash
docker container prune -f
```

- [ ] Remove unwanted images:
```bash
docker image prune -f
docker image prune -a -f
```

- [ ] Remove unused volumes:
```bash
docker volume prune -f
```

- [ ] Remove unused networks:
```bash
docker network prune -f
```

- [ ] Remove buildx and builder cache:
```bash
docker buildx prune -a -f
docker builder prune -a -f
```

- [ ] Rebuild and start Ollama stack:
```bash
docker compose --env-file <OLLAMA_ENV_FILE> -f <OLLAMA_COMPOSE_FILE> up -d --build
```

- [ ] Rebuild and start performance stack:
```bash
docker compose -f <PERFORMANCE_COMPOSE_FILE> up -d --build
```

- [ ] Verify both stacks:
```bash
docker compose --env-file <OLLAMA_ENV_FILE> -f <OLLAMA_COMPOSE_FILE> ps
docker compose -f <PERFORMANCE_COMPOSE_FILE> ps
```

- [ ] Verify endpoints:
```bash
curl -fsS http://localhost:11435/api/tags
curl -fsS http://localhost:8080/
```

Optional aggressive cleanup (global):
```bash
docker system prune -a --volumes -f
```

Only use aggressive cleanup when the user explicitly wants machine-wide cleanup beyond this repository.

## Compose best practices
- Keep Compose files explicit and service-oriented.
- Use one service per responsibility, such as separate Python and Node containers.
- Prefer minimal, ephemeral execution containers for one-off tasks.
- Keep environment variables explicit and avoid broad host dependency assumptions.
- Prefer named volumes for persistence and avoid attaching unrelated host directories.

## Examples
```bash
docker run --rm -v "${PWD}:/workspace" -w /workspace python:3.13-slim python -m venv .venv && . .venv/bin/activate && python -m pip install -r requirements.txt
docker run --rm -v "${PWD}:/workspace" -w /workspace python:3.13-slim python -m pytest
docker run --rm -v "${PWD}:/workspace" -w /workspace node:24-alpine npm install --no-fund --no-audit
docker run --rm -v "${PWD}:/workspace" -w /workspace node:24-alpine npm test
docker run --rm -v "${PWD}:/workspace" -w /workspace eclipse-temurin:27-jdk java -version
docker run --rm -v "${PWD}:/workspace" -w /workspace maven:3.9-eclipse-temurin-27 mvn -version
docker run --rm -v "${PWD}:/workspace" -w /workspace gradle:8.10-jdk27 gradle -v
```

## Git and remote sanity-check intent
If the user asks `verify git`, `commit`, `commit to remote`, `push`, or `push to remote`, run this mandatory checklist before any commit or push.

### Mandatory checks
- Scan all tracked and staged files for absolute physical host paths (for example `C:\`, `/Users/`, `/home/`, `/var/`, `D:\`).
- Do not commit files containing secrets, keys, tokens, credentials, or private endpoints even if modified.
- Replace secret values with placeholders before commit (for example `REDACTED_SECRET`).
- Replace physical machine-specific paths with neutral placeholders and use `/tmp/...` paths in examples when a filesystem path is required.
- Check Markdown size policy: keep operational Markdown files concise and aligned with enterprise documentation limits.
- Scan Markdown files for duplicated content blocks; duplicate documentation content is not allowed.
- Keep Markdown content organized as a single source of truth per topic, with cross-links instead of repeated instructions.
- Ensure related Markdown docs stay synchronized after any update (index docs, operation docs, and component docs must align).
- Verify Markdown formatting consistency across all `.md` files before commit/push.
- Enforce enterprise Markdown content-length limits and split oversized docs into focused files.
- Ensure cache directories are ignored by `.gitignore` before commit.
- Use professional, meaningful commit messages with no automation/tool attribution text.
- Push changes using a professional branch name (for example `chore/runtime-hardening`, `docs/manual-ops-policy`, `fix/perf-gatling-jdk27-default`).
- If the working branch already exists, pull the latest changes from `main` or `master` (whichever exists) before commit/push.
- Resolve merge conflicts locally before push and re-run sanity checks after conflict resolution.
- Verify workflow cost posture: prefer open-source/free GitHub Actions and avoid paid-only dependencies unless explicitly approved.

### Pre-push command checklist (manual)
```bash
# 1) Check absolute paths
git grep -nE '([A-Za-z]:\\\\|/Users/|/home/|/var/|/private/)'

# 2) Check likely secrets
git grep -nEi '(password|secret|token|apikey|api_key|private key|BEGIN [A-Z ]*PRIVATE KEY)'

# 3) Inspect markdown size
find . -name '*.md' -type f -print0 | xargs -0 wc -l | sort -n

# 3a) Detect potential duplicate markdown files by content hash
find . -name '*.md' -type f -print0 | xargs -0 sha256sum | sort | awk '{print $1}' | uniq -d

# 4) Verify markdown formatting consistency
npx -y markdownlint-cli2 "**/*.md"

# 5) Verify gitignore coverage for caches
git check-ignore -v .cache/ .pytest_cache/ .mypy_cache/ .ruff_cache/ node_modules/ target/

# 6) Final staged review
git status
git diff --staged

# 7) Sync existing branch with main/master and resolve conflicts
git fetch origin
git branch -r | grep -q 'origin/main' && git merge origin/main || git merge origin/master

# 8) If merge conflicts occur, resolve files, then:
git add <resolved-files>
git commit

# 9) Re-run sanity checks before push
git status
git diff --staged
```

### Markdown quality gate (enterprise)
- Preferred maximum size for operational Markdown: 250 lines per file.
- Absolute maximum for operational Markdown: 350 lines per file.
- If a file exceeds limits, split by topic and keep one authoritative source per workflow.
