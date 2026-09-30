# OpenRouter (Aggregator)

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://openrouter.ai/api` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `OPENROUTER_API_KEY` |
| Extra required | `ANTHROPIC_API_KEY=""` (empty string, prevents OAuth fallback) |
| Pay model | Pay-per-token, varies by model |

## Auth Note
Repository auth convention: Bearer `ANTHROPIC_AUTH_TOKEN`, explicit `ANTHROPIC_API_KEY=""`, not unset. Claude's Anthropic-compatible base is `https://openrouter.ai/api`, without `/v1`; the unauthenticated catalog is separately `https://openrouter.ai/api/v1/models`. [Provider integration guide](https://openrouter.ai/docs/guides/coding-agents/claude-code-integration), checked 2026-09-30; only Anthropic first-party routing is guaranteed compatible. Catalog presence is not Claude tool/context compatibility proof.

## Model Format
Catalog ids use `provider/model-name` and optional route tags such as `:free`. Validate against the live public catalog; retain any user-selected Claude context suffix separately. All opus/sonnet/haiku role vars use the same selected model.

Examples: `qwen/qwen3.7-plus`, `z-ai/glm-5.2`. The old example `qwen/qwen3-coder:free` is absent from the 2026-09-30 catalog; keep it as historical format evidence, not a currently selectable id.

## Default Model (customizable)

| Field | Default |
|-------|---------|
| Model | `qwen/qwen3.7-plus[1m]` |
| Applied to | OPUS + SONNET + HAIKU (all same) |

## Alias Template
```bash
alias claudeor='export ANTHROPIC_BASE_URL=https://openrouter.ai/api; export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="MODEL"; export ANTHROPIC_DEFAULT_SONNET_MODEL="MODEL"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="MODEL"; claude'
```

`MODEL` is a controlled placeholder, not raw user-text substitution. Use the main skill's safe writer and `openrouter-models.md` JSON validation; catalog refresh never authorizes alias/key/runtime changes.

## Dashboard
https://openrouter.ai/settings/keys (API keys, billing, usage)
