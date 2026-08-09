# SSH

SSH server management: connect, configure, deploy, administer Linux servers with safety gates and persistent config. Discovers or connects to a server, classifies every command by risk (READ/CREATE free, MODIFY/SERVICE/DELETE/PRIVILEGE gated), and generates a companion `ssh-admin` agent that reads server inventory from `CLAUDE.local.md`.

User-invocable only — `user-invocable: true` and `disable-model-invocation: true` in the frontmatter, so the model never auto-activates it. You type `/brewtools:ssh` or nothing runs. Not a `-setup` skill: it does not implement `status | install | upgrade | enable | disable | uninstall | purge` — those verbs are reserved for skills that install a mechanism you use afterward. `ssh` is a recurring tool with its own mode set (below).

## Quick Start

```
/brewtools:ssh
```

No server configured yet → setup. Server(s) configured, no args → execute (asks which one).

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Setup | `setup`, `new server`, `add server` (or no server configured) | Gather connection details, discover/try SSH keys, fall back to password + key install, add `~/.ssh/config` entry, discover the server, persist to config, generate `ssh-admin` agent |
| Connect | `connect to`, `ssh to`, `login` | Uses the single configured server, or asks which one if multiple |
| Configure | `configure`, `config`, `harden` | Asks which server, then executes the requested config change under the same command classification |
| Execute | any other text (default when servers are configured and args are non-empty) | Plans and classifies the requested commands, executes after confirmation gates where required |
| Update agent | `update agent`, `refresh agent`, `refresh` | Re-discovers up to 3 configured servers per run, refreshes `ssh-admin` agent |

## Examples

### Good Usage

```bash
# First run, no servers configured -- walks connection setup
/brewtools:ssh

# Add a new server
/brewtools:ssh setup new server vps-main 203.0.113.5

# Connect to the configured default
/brewtools:ssh connect to vps-main

# Run a read-only check -- no confirmation needed
/brewtools:ssh check disk space on vps-main

# Restart a service -- MODIFY/SERVICE, asks for confirmation first
/brewtools:ssh restart the app container on vps-main
```

### Common Mistakes

```bash
# Expecting a destructive command to run without confirmation
/brewtools:ssh remove the old docker volume on vps-main
# DELETE classification always asks via AskUserQuestion, with an explicit warning.

# Sending more than 5 commands in one invocation
/brewtools:ssh run these 8 commands on vps-main...
# Phase 5 caps at 5 SSH commands per invocation; beyond that it delegates to ssh-admin.

# Assuming password auth works non-interactively
/brewtools:ssh setup new server ...
# BatchMode=yes is required; a key-auth failure falls back to a one-time
# ssh-copy-id step the USER runs manually -- Claude Code cannot enter a password.
```

## What It Does

| Phase | Name | Description |
|-------|------|-------------|
| Phase 0 | Mode detection | Parses `$ARGUMENTS` for keywords, or falls back to server-presence default |
| Phase 1 | Environment + config check | SSH key/agent check, loads existing `CLAUDE.local.md` server list |
| Phase 2 | Connection setup | Gather host/user/port/name, try key auth, fall back to password + generated key, write `~/.ssh/config` entry, final connection test |
| Phase 3 | Server discovery | OS, kernel, arch, Docker version, disk, running containers, services, current user/groups |
| Phase 4 | Persist config | Update `CLAUDE.local.md`, gitignore it, generate `ssh-admin` agent, optionally set as default server |
| Phase 5 | Execute | Classify requested commands (READ/CREATE/MODIFY/SERVICE/DELETE/PRIVILEGE), confirmation gate for MODIFY+, execute directly or delegate to `ssh-admin` for multi-step work |
| Phase 6 | Session report | Server, mode, actions, changes, status; refreshes config/agent if server state changed |
| Mode: update-agent | Re-discover up to 3 configured servers, refresh `ssh-admin` agent |

Confirmation gates for MODIFY/SERVICE/DELETE/PRIVILEGE commands run in the main conversation via AskUserQuestion and are never delegated.

## Companion Agent

The skill generates `.claude/agents/ssh-admin.md` during Phase 4 setup, parametrized from the discovered server inventory. The skill drives connection setup and small execute requests directly in-session; for a bounded multi-command job on one host it delegates to `ssh-admin` via `Task` (one agent per host — a multi-server job is split into one spawn per server, never one agent looping over all of them). Both share the same command-classification table (READ/CREATE free, MODIFY/SERVICE/DELETE/PRIVILEGE gated) and both read `CLAUDE.local.md` for server inventory.

## Output

```markdown
# SSH [MODE]

## Detection
| Field | Value |
## Environment
| Component | Status |
## Server: [NAME]
| Property | Value |
## Actions Taken
- [action 1]
## Status
[success / partial / failed]
```

## Tips

- Run `/brewtools:ssh` with no arguments first — it tells you whether setup or execute is about to run before you commit to a mode.
- READ/CREATE commands execute freely; MODIFY/SERVICE ask once, DELETE/PRIVILEGE ask with an explicit destructive-action warning.
- If key auth fails during setup, expect a manual `ssh-copy-id` step — Claude Code cannot enter an interactive password.
- Delegate a multi-server task to several `ssh-admin` spawns, one per host, rather than one agent looping over all of them.

## Documentation

| Link | Target |
|------|--------|
| Plugin overview | [brewtools/README.md](../../README.md) |
| Companion agent | [ssh-admin](../../agents/ssh-admin.md) |
| Docs site | https://doc-claude.brewcode.app/brewtools/skills/ssh/ |
