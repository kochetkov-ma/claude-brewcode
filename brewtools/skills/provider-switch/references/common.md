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

## Switching Back to Anthropic Max (OAuth)

Alias `claude-max` unsets ALL provider variables, restoring default Anthropic behavior:

```bash
alias claude-max='unset ANTHROPIC_BASE_URL; unset ANTHROPIC_AUTH_TOKEN; unset ANTHROPIC_API_KEY; unset ANTHROPIC_DEFAULT_OPUS_MODEL; unset ANTHROPIC_DEFAULT_SONNET_MODEL; unset ANTHROPIC_DEFAULT_HAIKU_MODEL'
```

After running the alias, start `claude` normally — it will use your Max subscription via OAuth.

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

# Provider Aliases
alias claude-max='unset ANTHROPIC_BASE_URL; ...'
alias claude-glm='export ANTHROPIC_BASE_URL=...'
# ... etc

# ========== End Claude Code Provider Aliases ==========
```

## Usage Pattern
1. Open new terminal
2. Run provider alias: `claude-glm`
3. Run `claude` — connects to GLM
4. To switch back: open new terminal OR run `claude-max`
5. Run `claude` — back on Anthropic Max
