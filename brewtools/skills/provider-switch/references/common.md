# Common — Provider Switch

## Environment Variables

Claude Code uses these env vars to connect to alternative providers:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_BASE_URL` | API endpoint (replaces api.anthropic.com) |
| `ANTHROPIC_API_KEY` | API key sent as x-api-key header |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token (alternative to API key) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Model ID for opus role |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Model ID for sonnet role |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Model ID for haiku role |

## Returning to Anthropic Subscription

No special alias needed. Env vars set by provider aliases only persist in the current shell session. To return to Anthropic:

**Open a new terminal and run `claude` normally** — it will use your Max subscription via OAuth.

## .zshrc Structure

All provider config goes in a clearly marked section:

```bash
# ========== Claude Code Provider Aliases ==========
# Managed by brewtools:provider-switch — do not edit manually

# API Keys
export ZAI_API_KEY="..."
export DASHSCOPE_API_KEY="..."
export MINIMAX_API_KEY="..."
export OPENROUTER_API_KEY="sk-or-v1-..."

# Provider Aliases (each sets env vars + launches claude)
alias claudeglm='export ANTHROPIC_BASE_URL=...; ...; claude'
alias claudeqwen='export ANTHROPIC_BASE_URL=...; ...; claude'
# ... etc

# ========== End Claude Code Provider Aliases ==========
```

## Usage Pattern
1. Run provider alias: `claudeglm` — sets env vars and launches Claude in one command
2. When done, close the terminal
3. Next time: run `claude` normally = Anthropic subscription, or run alias = provider
