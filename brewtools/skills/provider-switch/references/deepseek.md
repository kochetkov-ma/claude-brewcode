# DeepSeek (V4)

Priority default: `deepseek-v4-pro` (model version DeepSeek-V4-Pro-0813); retain configured selections. [Model/pricing page](https://api-docs.deepseek.com/quick_start/pricing/), checked 2026-10-12. No quality rank implied.

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.deepseek.com/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` (Bearer) — `x-api-key` also supported |
| Key source env | `DEEPSEEK_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
Alias: Bearer `ANTHROPIC_AUTH_TOKEN` + empty `ANTHROPIC_API_KEY` ([Anthropic API guide](https://api-docs.deepseek.com/guides/anthropic_api/)). Never print/copy keys into arguments or reports.

## Model
| Field | Value |
|-------|-------|
| Configured model | `deepseek-v4-pro` |
| Unknown-id server fallback | `deepseek-flash` (V4.1-Flash); `claude-opus*` ids map to `deepseek-v4-pro`, `claude-sonnet*`/`claude-haiku*` to `deepseek-flash`. Report an echoed model mismatch, never claim the requested model ran |
| Context | 1M tokens, max output 384K |
| Modes | non-thinking / thinking; effort controls: see the provider guide |
| Release lineage | V4 preview 2026-04-24; V4 Pro GA 2026-08-13 ([announcement](https://api-docs.deepseek.com/news/news260813/)) |

Direct Pro USD per 1M, 2026-10-12: input cache miss $1.32 peak / $0.66 off-peak; output $3.96 / $1.98; cache hit $0.044 / $0.022. Peak hours: 01:00-04:00 and 06:00-10:00 UTC on weekdays except Chinese public holidays; other times off-peak. These differ from OpenRouter route prices.

## Compatibility Flags
None. The API guide (2026-10-12) ignores `anthropic-beta` on `/messages`, `anthropic-version`, `top_k`, `container`, `mcp_servers`; Files API needs its beta header. V4 Pro has no vision; Flash accepts images; document blocks unsupported.

## Alias
```bash
alias claudeds='export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic; export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_FABLE_MODEL=deepseek-v4-pro; claude'
```

## Dashboard
https://platform.deepseek.com (API keys, billing, usage)
