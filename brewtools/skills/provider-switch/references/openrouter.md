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
Bearer `ANTHROPIC_AUTH_TOKEN`. Base `https://openrouter.ai/api`, without `/v1`; the unauthenticated catalog is `https://openrouter.ai/api/v1/models`. [Integration guide](https://openrouter.ai/docs/guides/coding-agents/claude-code-integration), checked 2026-10-12: only the Anthropic first-party provider is guaranteed to work; catalog presence is no proof of Claude tool/context compatibility.

## Model Format
Catalog ids: `provider/model-name`, optional route tag such as `:free`. Validate against the live catalog; keep a user-selected `[1m]` client suffix separately.

Examples: `qwen/qwen3.7-plus`, `z-ai/glm-5.2`. `qwen/qwen3-coder:free` is absent from the catalog (2026-10-12): format evidence only, never offer it.

## Default Model (customizable)

| Field | Default |
|-------|---------|
| Model | `qwen/qwen3.7-plus[1m]` |
| Applied to | OPUS + SONNET + HAIKU + FABLE (all same) |

## Alias Template
```bash
alias claudeor='export ANTHROPIC_BASE_URL=https://openrouter.ai/api; export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="MODEL"; export ANTHROPIC_DEFAULT_SONNET_MODEL="MODEL"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="MODEL"; export ANTHROPIC_DEFAULT_FABLE_MODEL="MODEL"; claude'
```

`MODEL` is a placeholder: the main skill's writer fills it after `openrouter-models.md` JSON validation, never by text substitution. Catalog refresh never authorizes alias/key/runtime changes.

## Dashboard
https://openrouter.ai/settings/keys (API keys, billing, usage)
