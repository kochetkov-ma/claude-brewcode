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
CRITICAL: Must set `ANTHROPIC_API_KEY=""` (empty string, NOT unset). Without this, Claude Code falls back to Anthropic OAuth and ignores OpenRouter.
URL: `https://openrouter.ai/api` — no `/v1` suffix.

## Model Format
Models use `provider/model-name` format, e.g.: `qwen/qwen3.6-plus-preview:free`, `z-ai/glm-4.5`.
Claude Code has 3 internal roles: opus, sonnet, haiku. Each overridden via env var.

## Default Models (customizable)
| Role | Env Var | Default Model |
|------|---------|---------------|
| opus | ANTHROPIC_DEFAULT_OPUS_MODEL | qwen/qwen3.6-plus[1m] |
| sonnet | ANTHROPIC_DEFAULT_SONNET_MODEL | z-ai/glm-4.5 |
| haiku | ANTHROPIC_DEFAULT_HAIKU_MODEL | z-ai/glm-4.5-air |

## Alias Template
```bash
alias claude-openrouter='export ANTHROPIC_BASE_URL=https://openrouter.ai/api && export ANTHROPIC_AUTH_TOKEN=$OPENROUTER_API_KEY && export ANTHROPIC_API_KEY="" && export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen/qwen3.6-plus[1m]" && export ANTHROPIC_DEFAULT_SONNET_MODEL=z-ai/glm-4.5 && export ANTHROPIC_DEFAULT_HAIKU_MODEL=z-ai/glm-4.5-air'
```

## Dashboard
https://openrouter.ai/settings/keys (API keys, billing, usage)
