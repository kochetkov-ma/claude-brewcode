# MiniMax

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.minimax.io/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `MINIMAX_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
Uses `ANTHROPIC_AUTH_TOKEN`. Must unset `ANTHROPIC_API_KEY`.

## Models
| Role | Model ID | Context | Input $/1M | Output $/1M |
|------|----------|---------|-----------|------------|
| opus | minimax-m2.7 | 200K | $0.30 | $1.20 |
| sonnet | minimax-m2.7 | 200K | $0.30 | $1.20 |
| haiku | minimax-m2.7 | 200K | $0.30 | $1.20 |

Note: MiniMax currently has only one model (M2.7), used for all three roles.

## Alias
```bash
alias claude-minimax='export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic && export ANTHROPIC_AUTH_TOKEN=$MINIMAX_API_KEY && unset ANTHROPIC_API_KEY && export ANTHROPIC_DEFAULT_OPUS_MODEL=minimax-m2.7 && export ANTHROPIC_DEFAULT_SONNET_MODEL=minimax-m2.7 && export ANTHROPIC_DEFAULT_HAIKU_MODEL=minimax-m2.7'
```

## Dashboard
https://platform.minimax.io/ (account, billing, API keys)
