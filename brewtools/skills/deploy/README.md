# Deploy

GitHub Actions deployment: workflows, releases, GHCR, CI/CD with safety gates and persistent config. Detects mode from your prompt, walks a phase-based flow (setup, create workflow, release, trigger deploy, monitor runs), and generates a companion `deploy-admin` agent that reads project GitHub/workflow/server config from `CLAUDE.local.md`.

User-invocable only — `user-invocable: true` and `disable-model-invocation: true` in the frontmatter, so the model never auto-activates it. You type `/brewtools:deploy` or nothing runs. Not a `-setup` skill: it does not implement `status | install | upgrade | enable | disable | uninstall | purge` — those verbs are reserved for skills that install a mechanism you use afterward. `deploy` is a recurring tool with its own mode set (below).

## Quick Start

```
/brewtools:deploy
```

No GitHub config in `CLAUDE.local.md` yet → setup. Config exists → monitor.

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Setup | `setup`, `check`, `prerequisites`, `init` (or no config yet) | Verify `gh` auth, detect repo, check secrets, check SSH integration, discover workflows, persist config, generate `deploy-admin` agent |
| Create | `create`, `new workflow`, `add workflow` | Generate a new GitHub Actions workflow YAML from a template, persist it to config |
| Release | `release`, `bump`, `version`, `tag`, `publish` | Probe project release tooling, bump version, changelog, confirmation gate, commit + tag + push, monitor CI, verify published artifact |
| Deploy | `deploy`, `trigger`, `dispatch`, `run workflow` | List deployable workflows, select one, confirmation gate, trigger, watch the run, optional VPS health check |
| Monitor | `monitor`, `watch`, `status`, `check runs`, `logs` (default when config exists and no args) | Recent workflow runs, workflow states, releases, failed-run logs |
| Update agent | `update agent`, `refresh`, `rescan` | Re-discover workflows, regenerate `deploy-admin` agent from fresh data |

## Examples

### Good Usage

```bash
# First run in a repo with no GitHub config -- walks setup
/brewtools:deploy

# Scaffold a new workflow
/brewtools:deploy create a workflow that builds and pushes to GHCR

# Cut a release
/brewtools:deploy release

# Trigger a specific deploy workflow
/brewtools:deploy deploy the vps-deploy workflow

# Check recent CI runs and releases
/brewtools:deploy status
```

### Common Mistakes

```bash
# Expecting a bump/changelog script that does not exist in this repo
/brewtools:deploy release
# The skill probes .claude/scripts/, scripts/, package.json, Makefile first --
# a "none" result is not a failure, it asks which files carry the version.

# Assuming release pushes without confirmation
/brewtools:deploy release
# Step 5 is an AskUserQuestion gate before commit+tag+push -- always confirm first.

# Running deploy/release without gh auth
/brewtools:deploy release
# P1 env check fails fast: run `gh auth login` first.
```

## What It Does

| Phase | Name | Description |
|-------|------|-------------|
| P0 | Mode detection | Parses `$ARGUMENTS` for keywords, or falls back to config-presence default |
| P1 | Environment + config check | `gh` auth/version/repo/secrets check, loads existing `CLAUDE.local.md` GitHub config |
| P2 | Setup | Verify auth, detect repo, check secrets, check SSH integration section, discover workflows, persist config, gitignore `CLAUDE.local.md`, generate `deploy-admin` agent |
| P3 | Create workflow | Pick a workflow type (build+push GHCR / deploy to VPS / release / security scan / custom), write YAML, update config |
| P4 | Release | Probe tooling, bump version, changelog, confirmation gate, commit+tag+push, post-release hook, monitor CI, verify artifact |
| P5 | Deploy | List active workflows, select, confirmation gate, trigger, watch run, VPS health check if applicable |
| P6 | Monitor | Recent runs, workflow states, releases, failed-run logs, config refresh |
| Mode: update-agent | Re-discover workflows, regenerate `deploy-admin` agent |

Every confirmation gate (release Step 5, deploy Step 4) runs in the main conversation via AskUserQuestion — never delegated to a subagent.

## Companion Agent

The skill generates `.claude/agents/deploy-admin.md` during setup, parametrized from the project's own GitHub config, workflow inventory and (if present) SSH server targets. The skill drives the phase-based flow directly in-session; `deploy-admin` is what you delegate a bounded release/deploy/monitor unit to afterward, or what the skill itself spawns via `Task` for a self-contained deliverable. Both share the same safety classification (READ/CREATE free, MODIFY/SERVICE/DELETE/PRIVILEGE gated) and both read `CLAUDE.local.md` for project-specific config — the skill's `references/safety-rules.md` and the agent's frontmatter body carry the same table.

## Output

```markdown
# Deploy [MODE]

## Detection
| Field | Value |
## Environment
| Component | Status |
## Actions Taken
- [action 1]
## Status
[success / partial / failed]
```

## Tips

- Run `/brewtools:deploy` with no arguments first in a new repo — it tells you whether setup or monitor is about to run before you commit to a mode.
- `release` is safe to interrupt at the confirmation gate (Step 5) — nothing is pushed until you approve.
- If a step reports "no post-release script" or "no external artifact to verify", that is expected for projects without one — not a failure.
- Delegate a multi-repo or multi-environment release to several `deploy-admin` spawns, one per target, rather than one agent looping over all of them.

## Documentation

| Link | Target |
|------|--------|
| Plugin overview | [brewtools/README.md](../../README.md) |
| Companion agent | [deploy-admin](../../agents/deploy-admin.md) |
| Docs site | https://doc-claude.brewcode.app/brewtools/skills/deploy/ |
