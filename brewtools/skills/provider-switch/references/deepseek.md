---
auto-sync: enabled
auto-sync-date: 2026-04-24
auto-sync-type: doc
auto-sync-override: |
  sources: https://api-docs.deepseek.com/guides/anthropic_api, https://api-docs.deepseek.com/
  focus: model IDs, pricing per 1M tokens, context window, endpoint URL
  preserve: ## Alias, ## Dashboard
---

# DeepSeek (V4)

> **Priority provider** — DeepSeek V4 is the strongest Chinese open model (1.6T MoE, 1M context) with a native Anthropic-compatible endpoint. Recommended default for this skill.

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.deepseek.com/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` (Bearer) — `x-api-key` also supported |
| Key source env | `DEEPSEEK_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
DeepSeek accepts both `x-api-key` and `Authorization: Bearer`. Uses `ANTHROPIC_AUTH_TOKEN` (unified with other providers). Must set `ANTHROPIC_API_KEY=""` to prevent OAuth fallback.

## Model
| Field | Value |
|-------|-------|
| Model ID (top) | `deepseek-v4-pro` |
| Fallback | `deepseek-v4-flash` (auto-mapped on unknown model IDs) |
| Context | 1M tokens |
| Modes | non-thinking, thinking, thinking_max |
| Released | 2026-04-24 |

Same top model for all three Claude Code roles (opus/sonnet/haiku).

## Compatibility Flags
None required. DeepSeek ignores `anthropic-beta`, `anthropic-version`, `top_k`, `container`, `mcp_servers` silently — no Claude Code workaround needed. Multimodal input (images/documents) is NOT supported.

## Alias
```bash
alias claudedeepseek='export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic; export ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro; claude'
```

## Dashboard
https://platform.deepseek.com (API keys, billing, usage)
