---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
auto-sync-override: |
  sources: https://platform.minimax.io/docs/guides/text-ai-coding-tools, https://platform.minimax.io/docs/guides/models-intro
  focus: model IDs, pricing, context window, new model releases
  preserve: ## Alias, ## Dashboard, ## Auth Note
---

# MiniMax

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.minimax.io/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `MINIMAX_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
Uses `ANTHROPIC_AUTH_TOKEN`. Must set `ANTHROPIC_API_KEY=""` (empty string, NOT unset) to prevent OAuth fallback.

## Models
| Role | Model ID | Context | Input $/1M | Output $/1M |
|------|----------|---------|-----------|------------|
| opus | minimax-m2.7 | 200K | $0.30 | $1.20 |
| sonnet | minimax-m2.7 | 200K | $0.30 | $1.20 |
| haiku | minimax-m2.7 | 200K | $0.30 | $1.20 |

Note: MiniMax currently has only one model (M2.7), used for all three roles.

## Prompt Caching (Verified)
MiniMax fully supports Anthropic-style prompt caching on the Anthropic-compatible endpoint.
Docs: https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache

| Type | Price / 1M tokens | Multiplier |
|------|--:|---|
| Standard input | $0.30 | baseline |
| Cache write | $0.375 | 1.25x input |
| Cache read | $0.06 | 0.1x input |

- TTL: 5 minutes, auto-refreshed on hit
- Max breakpoints: 4 per request
- Min tokens: 512
- Response fields: `cache_creation_input_tokens`, `cache_read_input_tokens`
- Supported models: M2.7, M2.7-highspeed, M2.5, M2.1, M2

## Alias
```bash
alias claudeminimax='export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic; export ANTHROPIC_AUTH_TOKEN=$MINIMAX_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=minimax-m2.7; export ANTHROPIC_DEFAULT_SONNET_MODEL=minimax-m2.7; export ANTHROPIC_DEFAULT_HAIKU_MODEL=minimax-m2.7; claude'
```

## Dashboard
https://platform.minimax.io/ (account, billing, API keys)
