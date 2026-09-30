# MiniMax

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.minimax.io/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `MINIMAX_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
Alias uses Bearer `ANTHROPIC_AUTH_TOKEN` with explicit `ANTHROPIC_API_KEY=""`, not unset. [Official Claude integration](https://platform.minimax.io/docs/token-plan/claude-code), checked 2026-09-30, documents the international endpoint and `MiniMax-M3[1m]`; preserve configured `MiniMax-M3` and ask before changing client context/model configuration.

## Configured Model / Direct Prices — 2026-09-30

`MiniMax-M3` serves all three roles; it is not MiniMax's only offered model. Context up to 1M ([model announcement](https://www.minimax.io/blog/minimax-m3)). [Pay-as-you-go standard rates](https://platform.minimax.io/docs/guides/pricing-paygo), USD per 1M:

| Input length | Input | Output | Cache read |
|--------------|-------|--------|------------|
| <=512K, including cached input | $0.30 | $1.20 | $0.06 |
| >512K | $0.60 | $2.40 | $0.12 |

Published rates include the provider's permanent 50% discount; priority tier costs 1.5x standard. OpenRouter routing prices are separate.

## Compatibility Flags (REQUIRED)
- `CLAUDE_ENABLE_BYTE_WATCHDOG=0` — disables byte-level streaming watchdog
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` — strips beta headers that MiniMax rejects

## Caching — 2026-09-30

[Passive caching](https://platform.minimax.io/docs/api-reference/text-prompt-caching) supports M3 on the Anthropic endpoint: >=512 input tokens, repeated-prefix matching, no separate cache-write fee, load-dependent expiration. Inspect `cache_read_input_tokens`; do not assume a hit or a fixed 5-minute TTL.

[Explicit `cache_control` caching](https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache) currently lists M2.x, not M3: 5-minute TTL refreshed on hit, up to four breakpoints, `cache_creation_input_tokens`/`cache_read_input_tokens`. For M2.7 the table lists $0.30 input, $0.375 write (1.25x), $0.06 read (0.2x). Do not apply these explicit-write charges/limits to M3.

## Alias
```bash
alias claudeminimax='export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic; export ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=MiniMax-M3; export ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M3; export ANTHROPIC_DEFAULT_HAIKU_MODEL=MiniMax-M3; export CLAUDE_ENABLE_BYTE_WATCHDOG=0; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
```

## Dashboard
https://platform.minimax.io/ (account, billing, API keys)
