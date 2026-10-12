# Provider Switch

Switch Claude Code from Anthropic Max to a pay-per-token API provider — **DeepSeek V4 (priority)**, Z.ai/GLM, Qwen/DashScope, MiniMax, or OpenRouter — without touching any config files manually. The skill creates isolated shell aliases in `~/.zshrc`, backs up existing content before any write, and has you place the API key out of band, so the key never passes through the chat.

> **DeepSeek V4 is the recommended default** — 1M context, native Anthropic endpoint, no compatibility flags required.

## Quick Start

```bash
/brewtools:provider-switch                # which providers are configured (read-only)
/brewtools:provider-switch deepseek       # set up DeepSeek V4 (priority default)
/brewtools:provider-switch install        # pick one or more providers
/brewtools:provider-switch verify         # test every configured key
/brewtools:provider-switch model-check    # inside a provider session: which model answers
```

After install, run `claudeds` — it sets env vars and starts Claude in one command. To return to Anthropic, open a new terminal.

## Features

- Language selection (English / Russian) before a configuring run, when the conversation language is unclear
- Reads current `~/.zshrc` state before any write — shows what is already configured
- `status` is read-only: with nothing configured it prints how to install, and installing always takes an explicit `install` or provider name
- One model for every role (opus, sonnet, haiku, fable), so subagents pinned to any of them stay on the provider; OpenRouter IDs are validated against its live catalog
- All writes go into one marked section of `~/.zshrc`
- Error reporting with `SCRIPT_ERROR / PHASE / ACTION / SUGGESTION` block on any failure

## Credential handling

| Rule | Why |
|------|-----|
| The API key is piped to `write-alias.sh set-key` on **stdin**, never as an argument | argv is visible to `ps` and lands in the session transcript; `set-key` rejects a key passed as an argument |
| The `~/.zshrc.bak` snapshot is created under `umask 077`, `chmod 600`, and deleted on success | The backup holds the keys already in `~/.zshrc`; a readable leftover copy would be a second leak |
| Line edits use `awk` + temp file + `mv`, not `sed -i ''` | `sed -i ''` is BSD-only; on Linux it consumes the next argument and breaks `set-key`, `set-alias`, `remove-key`, `remove-alias` |

## Providers

| Provider | Alias | Model (all roles) | Auth pattern | Notes |
|----------|-------|-------------------|-------------|-------|
| **DeepSeek V4** (priority) | `claudeds` | deepseek-v4-pro | `ANTHROPIC_AUTH_TOKEN` + `API_KEY=""` | 1M context, thinking modes, V4 Pro GA 2026-08-13 |
| Z.ai / GLM | `claudeglm` | glm-5.2 | `ANTHROPIC_AUTH_TOKEN` + `API_KEY=""` | SWE-bench Pro 62.1% (self-reported), 1M ctx, $1.40/$4.40 per 1M |
| Qwen / DashScope | `claudeqwen` | qwen3.7-plus[1m] | `ANTHROPIC_AUTH_TOKEN` + `API_KEY=""` | 1M context, $0.40/$1.60 per 1M up to 256K input. Key must match the endpoint region |
| MiniMax | `claudeminimax` | MiniMax-M3 | `ANTHROPIC_AUTH_TOKEN` + `API_KEY=""` | Cheapest: $0.30/$1.20 per 1M |
| OpenRouter | `claudeor` | user-selected | `ANTHROPIC_AUTH_TOKEN` + `API_KEY=""` | Default: qwen/qwen3.7-plus[1m]. Custom IDs validated via API |

## Usage Modes

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

## How Switching Works

Each alias sets seven environment variables (plus the provider's compatibility flags) and launches `claude` — one command. Env vars only persist in the current shell session. To return to Anthropic, open a new terminal and run `claude` normally.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_BASE_URL` | Points to the provider's API endpoint |
| `ANTHROPIC_API_KEY` | Set to `""` (empty string) for all providers, so an exported Anthropic key is never sent to the provider |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token with provider API key (all providers) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Model ID for opus-class tasks |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Model ID for sonnet-class tasks |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Model ID for haiku-class and background tasks |
| `ANTHROPIC_DEFAULT_FABLE_MODEL` | Model ID for fable-class tasks |

## Qwen: Key Must Match the Region

A Model Studio pay-as-you-go key works only with the endpoint of the region and workspace it was created in (Beijing, Singapore or Virginia); Coding Plan keys use their own endpoint. The default alias keeps the international endpoint `dashscope-intl.aliyuncs.com`, so create the key in the matching region: [Model Studio, Singapore, API Key](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=dashboard#/api-key), **Create API Key**, then copy it when shown. The key's prefix or length tells you nothing about its region.

## Files

```
brewtools/skills/provider-switch/
├── SKILL.md                         # Skill definition and phases
├── scripts/
│   ├── detect-mode.sh               # Parses the prompt → MODE
│   ├── check-status.sh              # Reads ~/.zshrc, outputs key=value status
│   ├── read-secret.sh               # Moves a key from a file/env var into ~/.zshrc via stdin
│   ├── write-alias.sh               # init / set-key / set-alias subcommands
│   ├── provider-alias.py            # Validates JSON requests, serializes aliases
│   └── verify-providers.sh          # Tests provider tokens (curl health check)
├── tests/run.sh                     # Isolated-HOME suites for the scripts
└── references/
    ├── common.md                    # Env var reference, ~/.zshrc structure
    ├── update-protocol.md           # Maintainer refresh of provider facts
    ├── deepseek.md, zai-glm.md, qwen-dashscope.md, minimax.md, openrouter.md
    │                                # per provider: endpoint, model, prices, alias, dashboard URL
    └── openrouter-models.md         # Model presets for OpenRouter picker
```

## Documentation

Full docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

---

Author: Maksim Kochetkov | License: MIT
