# Git and Docs Sanity Instructions

This instruction set is profile-neutral and applies to all workflow profiles before commit or push workflows.

## Trigger intent
Apply this checklist when user asks for:
- verify git
- commit
- commit to remote
- push
- push to remote

## Required checks
- Scan tracked/staged files for absolute physical host paths; replace with neutral placeholders.
- Do not push files containing secrets, tokens, keys, or credentials.
- Replace sensitive values with placeholders and use /tmp paths in docs/examples where filesystem paths are required.
- Scan markdown docs for duplicate content; keep one source of truth per topic.
- Keep markdown docs synchronized and aligned after updates.
- Verify markdown formatting consistency across all `.md` files before commit/push.
- Enforce markdown length limits for enterprise docs:
  - Preferred: <= 250 lines
  - Absolute max: <= 350 lines
- Ensure cache directories are ignored in .gitignore.
- Use professional commit messages with no automation/tool attribution.
- Use professional branch names.
- For existing branches, fetch and merge latest origin/main or origin/master before push.
- Resolve merge conflicts locally and re-run sanity checks.
- Prefer open-source/free GitHub workflow actions when possible.

## Manual command checklist
```bash
# 1) Absolute path scan
git grep -nE '([A-Za-z]:\\\\|/Users/|/home/|/var/|/private/)'

# 2) Secret scan
git grep -nEi '(password|secret|token|apikey|api_key|private key|BEGIN [A-Z ]*PRIVATE KEY)'

# 3) Markdown length check
find . -name '*.md' -type f -print0 | xargs -0 wc -l | sort -n

# 4) Duplicate markdown content hash check
find . -name '*.md' -type f -print0 | xargs -0 sha256sum | sort | awk '{print $1}' | uniq -d

# 5) Markdown formatting verification (open-source tooling)
npx -y markdownlint-cli2 "**/*.md"

# 6) Cache ignore verification
git check-ignore -v .cache/ .pytest_cache/ .mypy_cache/ .ruff_cache/ node_modules/ target/

# 7) Branch sync and merge conflict handling
git fetch origin
git branch -r | grep -q 'origin/main' && git merge origin/main || git merge origin/master
# resolve conflicts if present, then:
# git add <resolved-files>
# git commit

# 8) Final staged review
git status
git diff --staged
```
