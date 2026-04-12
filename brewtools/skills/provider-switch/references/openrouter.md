---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
auto-sync-override: |
  sources: https://openrouter.ai/api/v1/models
  focus: endpoint URL, auth requirements, default model recommendations
  preserve: ## Alias Template, ## Dashboard, ## Auth Note
---

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
Uses `ANTHROPIC_AUTH_TOKEN`. Must set `ANTHROPIC_API_KEY=""` (empty string, NOT unset) to prevent OAuth fallback.
URL: `https://openrouter.ai/api` — no `/v1` suffix.

## Model Format
Models use `provider/model-name` format, e.g.: `qwen/qwen3.6-plus`, `z-ai/glm-5.1`, `qwen/qwen3-coder:free`.
Claude Code has 3 internal roles: opus, sonnet, haiku. Each overridden via env var.

## Default Model (customizable)

One model for all three roles. User selects during setup.

| Field | Default |
|-------|---------|
| Model | `qwen/qwen3.6-plus[1m]` |
| Applied to | OPUS + SONNET + HAIKU (all same) |

## Alias Template
```bash
alias claudeor='export ANTHROPIC_BASE_URL=https://openrouter.ai/api; export ANTHROPIC_AUTH_TOKEN=$OPENROUTER_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="MODEL"; export ANTHROPIC_DEFAULT_SONNET_MODEL="MODEL"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="MODEL"; claude'
```

Replace `MODEL` with user's chosen model ID (same value for all three vars).

## Dashboard
https://openrouter.ai/settings/keys (API keys, billing, usage)
