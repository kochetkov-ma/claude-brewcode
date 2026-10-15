# Manager

Opt-in **HARD wall**: a `PreToolUse` guard installed into your project denies Write/Edit/mutating Bash in the **main session**, so Claude delegates hands-on work to subagents. Subagents stay free. Project-only, off until armed. The codewords `++m`, `++a`, `++rr`, `++r`, `+++` live in the [`brewmod-placeholders`](https://doc-claude.brewcode.app/mods/placeholders/) mod.

## Install

```
claude plugin install brewtools@claude-brewcode
```

Then run `/brewtools:manager-setup install` in the project (it asks before arming).

## Usage

| Command | What it does |
|---------|-------------|
| `/brewtools:manager-setup` | No argument = `status`. |
| `/brewtools:manager-setup status` | Print wall state, task-tools state, the codewords pointer (mod) and any legacy override files. Reports whether a wall is installed (registration or copied guard present): a `state.json` left by `uninstall` is not a wall, so a stale version there recommends `install`, never `upgrade` |
| `/brewtools:manager-setup install` | Install the HARD wall guard into this project. Asks to confirm before arming (`AskUserQuestion`) unless your prompt already said so explicitly (e.g. "enable the hard wall") — plain `install` or autonomy phrasing never counts; declining still installs and leaves `state.hard=false`. Applies live (settings are watched). On Claude Code >= 2.1.233 it also sets the task-tools key `env.CLAUDE_CODE_ENABLE_TODO_TOOLS="1"` in `.claude/settings.local.json`, but only when no settings layer (local, project, user) already sets it; an explicit `0`/`false`/empty value is kept and reported `kept off`. |
| `/brewtools:manager-setup upgrade` | Re-copy the guard and the off-switch CLI from the current plugin version, re-register if missing, add what an older install lacks (`onFailure: "block"`, the task-tools key under the same no-override rule), and restamp `state.json`'s `version`/`generated_by`/`last_updated`, which clears a `stale` verdict in `/brewcode:setup-status`. `hard`/`level` preserved; aborts if not installed (no registration and no copied guard; a leftover `state.json` alone does not count). |
| `/brewtools:manager-setup enable` | Arm an already-installed wall (state flip only) — same confirm gate as `install`; declining aborts with nothing changed. Not installed → routes you to `install`. |
| `/brewtools:manager-setup disable` | Disarm the HARD wall (state flip only; registration stays in `settings.local.json`). Guard no-ops until re-armed. |
| `/brewtools:manager-setup uninstall` | Deregister the wall from `settings.local.json` + delete the copied guard. Auto-disarms first. State, codeword overrides and the task-tools key are KEPT. Applies live; a settings file left `{}` is deleted. |
| `/brewtools:manager-setup purge` | `uninstall` + delete `state.json`, the copied guard and helper (codeword `prompts/` overrides are kept), plus an emptied `.claude/brewtools/`, a leftover `settings.local.json.bak`, an emptied `settings.local.json`/`.claude/`. The task-tools key is removed only when this skill's install added it. The only destructive action. |
| `/brewtools:manager-setup level <strict\|balanced>` | Set wall strictness (project only). `balanced` = read-only Bash allowed; `strict` = all Bash denied. |
| `/brewtools:manager-setup <any task>` | Inline Manager run — delegates the task, wall untouched |

Every verb is project-only; `--scope global` is ignored. The guard fails closed: an unparseable payload or a broken `state.json` is denied in the main session. Bash outside the binary allowlist, or with a known exec flag, is denied too.

Examples:

```
/brewtools:manager-setup level strict        # no Bash at all in the main session
/brewtools:manager-setup disable             # disarm, registration stays
/brewtools:manager-setup refactor the auth module   # inline Manager run
```

Free text works too (`manager on`, `disarm wall`, `<task> in hard mode`, `<task> as manager`); `on`, `off` and `reset` are synonyms, not commands. Guard files live in `<project>/.claude/brewtools/manager/`; state is `state.json` there. Remove the wall with `disable` or `uninstall`, never by deleting files: a missing registered guard blocks every tool call (`onFailure: "block"`).

Full documentation (tool buckets, off-switch, state, recovery): [doc-claude.brewcode.app/brewtools/skills/manager-setup/](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/). Source: [SKILL.md](SKILL.md), [references/hard.md](references/hard.md).
