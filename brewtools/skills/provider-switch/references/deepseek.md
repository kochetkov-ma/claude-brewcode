# DeepSeek (V4)

Repository priority/default: `deepseek-v4-pro`; retain configured selections. [Direct model/pricing snapshot](https://api-docs.deepseek.com/quick_start/pricing/), checked 2026-09-30: V4 Pro remains available with 1M context; Flash now denotes V4.1. No comparative quality rank is implied.

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.deepseek.com/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` (Bearer) — `x-api-key` also supported |
| Key source env | `DEEPSEEK_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
The repository alias uses Bearer `ANTHROPIC_AUTH_TOKEN` and explicit empty `ANTHROPIC_API_KEY`; the [Anthropic API guide](https://api-docs.deepseek.com/guides/anthropic_api/) also documents `x-api-key`. Preserve the auth convention; never print/copy keys into arguments or reports.

## Model
| Field | Value |
|-------|-------|
| Configured model | `deepseek-v4-pro` |
| Unknown-id server fallback | `deepseek-flash` (V4.1); report an echoed model mismatch, never claim the requested model ran |
| Context | 1M tokens |
| Modes | non-thinking / thinking; consult current effort controls in the provider guide |
| Release lineage | V4 preview 2026-04-24; V4 Pro GA 2026-08-13 ([announcement](https://api-docs.deepseek.com/news/news260813/)) |

The previous V4 reference recorded 1.6T MoE parameters; this historical architecture figure was not reverified in the 2026-09-30 API refresh.

Direct Pro USD per 1M, 2026-09-30: input cache miss $1.32 peak / $0.66 off-peak; output $3.96 / $1.98; cache hit $0.044 / $0.022. Peak hours: 01:00-04:00 and 06:00-10:00 UTC on weekdays except Chinese public holidays; other times off-peak. These differ from OpenRouter route prices.

Same top model for all three Claude Code roles (opus/sonnet/haiku).

## Compatibility Flags
No repository compatibility flags. The current API guide ignores beta headers for messages, version, top_k, container and mcp_servers; Files API beta handling differs. V4 Pro does not support vision; current Flash supports image input. Document blocks remain unsupported. Do not apply the old blanket no-images claim to all DeepSeek models.

## Alias
```bash
alias claudeds='export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic; export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro; claude'
```

## Dashboard
https://platform.deepseek.com (API keys, billing, usage)
