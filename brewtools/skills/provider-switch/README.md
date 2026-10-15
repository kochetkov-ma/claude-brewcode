# Provider Switch

Switch Claude Code to a pay-per-token provider: **DeepSeek V4 (priority)**, Z.ai/GLM, Qwen/DashScope, MiniMax or OpenRouter. The skill writes isolated aliases into one marked section of `~/.zshrc`, backs up first, and takes the API key out of band so it never passes through the chat.

## Install

```bash
claude plugin install brewtools@claude-brewcode
```

## Usage

```bash
/brewtools:provider-switch                # status, read-only
/brewtools:provider-switch deepseek       # set up DeepSeek V4
/brewtools:provider-switch verify         # test every configured key
```

Then run the alias (`claudeds`, `claudeglm`, `claudeqwen`, `claudeminimax`, `claudeor`). To return to Anthropic, open a new terminal.

| Argument | Mode | What it does |
|----------|------|-------------|
| (none) | status | Shows the provider table, read-only; prints the install command if nothing is configured |
| `install` | install | Interactive selection of one or more providers to configure |
| `deepseek` / `ds` / `dpsk` | provider-deepseek | Configure DeepSeek V4 only (priority default) |
| `glm` / `zai` / `z.ai` | provider-glm | Configure Z.ai/GLM only |
| `qwen` / `dashscope` | provider-qwen | Configure Qwen/DashScope only |
| `minimax` / `mini` | provider-minimax | Configure MiniMax only |
| `openrouter` / `router` | provider-openrouter | Configure OpenRouter + model selection |
| `help` / `how` | help | Explains how aliases work, env vars, and dashboards |
| `verify` / `test` | verify | Tests all configured tokens by sending a minimal API request to each endpoint |
| `model-check` / `identify` | model-check | Asks 5 diagnostic questions to identify the model (run inside a provider session) |

Credentials: the key is piped to `write-alias.sh set-key` on stdin, never as an argument; the `~/.zshrc.bak` snapshot is `chmod 600` and deleted on success.

Models, prices, credential rules and the Qwen region note are on the docs page.

## Documentation

Full docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)
