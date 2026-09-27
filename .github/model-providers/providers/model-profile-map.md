# Model Profile Map

This map keeps profile entry files synchronized in one place.

## Canonical policies
- Runtime and container workflow policy: [../instructions/docker-runtime.instructions.md](../instructions/docker-runtime.instructions.md)
- Git/docs verification and push sanity policy: [../instructions/git-docs-sanity.instructions.md](../instructions/git-docs-sanity.instructions.md)

## Profile mapping

| Profile | Profile entry file |
|---|---|
| Claude | [CLAUDE.md](CLAUDE.md) |
| DeepSeek | [DEEPSEEK.md](DEEPSEEK.md) |
| Gemini | [GEMINI.md](GEMINI.md) |
| Grok | [GROK.md](GROK.md) |
| Qwen | [QWEN.md](QWEN.md) |

## Sync rule
- Do not duplicate runtime policy text in profile entry files.
- Keep profile entry files as short routers only.
- Keep runtime policy updates in one place: [../instructions/docker-runtime.instructions.md](../instructions/docker-runtime.instructions.md).
- Keep git/docs sanity policy updates in one place: [../instructions/git-docs-sanity.instructions.md](../instructions/git-docs-sanity.instructions.md).
