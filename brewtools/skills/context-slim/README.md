# Context Slim

Shrinks the token weight of the permanent LLM-context surface (CLAUDE.md, rules, conventions,
AGENTS.md, memory, agent descriptions and bodies, hook text, opt-in skill bodies) with three levers:
cross-layer dedup, default-knowledge removal, per-file compression. Every exact value, key, path,
version pin and non-default instruction survives, or the run fails and rolls back.

## Install

```bash
claude plugin install brewtools@claude-brewcode
```

## Usage

```
/brewtools:context-slim
```

The bare call runs `measure`: read-only, prints the current token weight per tier, touches no file.

| Mode | Trigger | Mutates? | What it does |
|------|---------|----------|--------------|
| **measure** | _(default, no mode word)_ | no | Scans and reports current token weight per tier -- baseline for every other mode |
| **preview** | `preview` | no | Runs the full dedup + drop + compress plan, shows the diff, writes nothing |
| **slim** | `slim` | yes | Applies the plan: dedup, drop-catalog removal, per-file compression -- lossless by construction |
| **hard** | `hard` | yes (destructive) | Same as `slim`, but authorises a deeper lossy pass once you approve the escalation an unmet `--target` triggers in every mutating mode |
| **bodies** | `bodies` (combine with `slim`/`hard`/`preview`) | opt-in scope | Extends scope to PER-INVOCATION (skill bodies + `references/*.md`) -- off by default |
| **restore** | `restore [ts]` | yes (destructive) | Reverts to a prior snapshot; `[ts]` picks a specific run, omitted = latest |

Flags: `--target=N%` (measured against this run's fresh scope), `--global` (also write
`$HOME/.claude`, default project only), `--memory`, `--noask` (skips clarifying questions only,
never a destructive confirmation).

```bash
/brewtools:context-slim preview --target=20%
/brewtools:context-slim slim --target=15%
/brewtools:context-slim restore
/brewtools:context-slim restore --global last
```

Safety: every mutating run is snapshotted first (`~/.claude/backups/`), a tracked dirty target is
refused, a verification failure rolls everything back, and MCP servers, plugin enablement and
`settings.json` are never mutated, only advised. Backups keep the newest 5 runs and never prune one under 24 h old; in a git root the guard appends `.claude/reports/` to `.gitignore`.

## Documentation

Full docs: [context-slim](https://doc-claude.brewcode.app/brewtools/skills/context-slim/)
