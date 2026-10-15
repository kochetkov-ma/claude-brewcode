# Agent Router

> **EXPERIMENTAL.** Opt-in, project scope only.

Installs one PreToolUse hook (matcher `Agent`) that catches the main loop spawning `general-purpose` when a project agent from `.claude/agents/` or a brewcode specialist owns the task, and redirects it to that expert. A deny is a tool error the model acts on: the human is never prompted, and the same task is denied at most once per session.

## Install

```
claude plugin install brewtools@claude-brewcode
```

Then run `/brewtools:agent-router-setup install` in the project. Nothing is wired until you do.

## Usage

```
/brewtools:agent-router-setup                  # status (default, no args)
/brewtools:agent-router-setup install          # install, asks level, defaults to fast
/brewtools:agent-router-setup upgrade          # re-emit from the current plugin version, level kept
/brewtools:agent-router-setup enable           # back on
/brewtools:agent-router-setup disable          # enabled:false, hook stays wired
/brewtools:agent-router-setup uninstall        # unwire + delete the hook file, keep config
/brewtools:agent-router-setup purge            # + delete config and this project's tmp state
/brewtools:agent-router-setup level strict     # add the LLM judge (read the cost first)
/brewtools:agent-router-setup level fast       # drop it again
```

| Mode | Hook file | settings.json | Config | tmp state |
|------|-----------|---------------|--------|-----------|
| `status` | — | — | — | — |
| `install` | copied | entries merged | written | — |
| `upgrade` | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted | entries stripped | **kept** | kept |
| `purge` | deleted | entries stripped | deleted | this project's dir deleted |
| `level fast` (extra) | kept | tier-2 + heartbeat stripped | `level:"fast"` | kept |
| `level strict` (extra) | kept | tier-2 + heartbeat appended | `level:"strict"` | kept |

Config keys in `agent-router.json` (`enabled`, `level`, `genericTypes`, `neverFlag`, `minScore`, `margin`, `intents`): only an explicit `enabled:false` turns the hook off; `level` is a record, change it with `level fast|strict`.

| Tier | Default | Cost |
|------|---------|------|
| 1 (`level fast`) | on | Deterministic Node script, under 100 ms, **0 tokens** |
| 2 (`level strict`) | off | One small-model agent-hook call on every `Agent` spawn; no model pinned |

A judge timeout or model error is a silent allow; everything fails open.

| What | Path |
|------|------|
| Hook | `<repo>/.claude/hooks/agent-router.mjs` |
| Wiring | `<repo>/.claude/settings.json` |
| Config | `<repo>/.claude/brewtools/agent-router.json` |

Not registered in `brewtools/hooks/hooks.json`; a deny can be bypassed per spawn with `agent-router: override` in the task text. Config keys, decision order and limits: [full documentation](https://doc-claude.brewcode.app/brewtools/skills/agent-router-setup/). Source: [SKILL.md](SKILL.md), [assets/INSTALL.md](assets/INSTALL.md).
